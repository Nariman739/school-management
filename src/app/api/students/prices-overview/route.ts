import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMonday } from "@/lib/schedule-utils";

// GET /api/students/prices-overview
// Кто из детей за какую услугу занимается и стоит ли у него цена.
// Считаем по занятиям текущей и будущих недель: именно они пойдут
// в зарплату и счёт родителям.
export async function GET() {
  try {
    const fromWeek = getMonday(new Date());

    const slots = await prisma.scheduleSlot.findMany({
      where: { weekStartDate: { gte: fromWeek }, NOT: { serviceTypeId: null } },
      select: {
        serviceTypeId: true,
        studentId: true,
        frozenPrice: true,
        weekStartDate: true,
        group: { select: { members: { select: { studentId: true } } } },
      },
    });

    // (ученик × услуга) → сколько занятий, и сколько из них уйдут в ноль.
    // Ноль — это занятие без замороженной цены у ребёнка, которому цену
    // взять неоткуда: ни в матрице, ни в старой ставке.
    const lessons = new Map<string, number>();
    const unpriced = new Map<string, number>();
    const addLesson = (studentId: string, serviceTypeId: string, noFrozen: boolean) => {
      const key = `${studentId}|${serviceTypeId}`;
      lessons.set(key, (lessons.get(key) ?? 0) + 1);
      if (noFrozen) unpriced.set(key, (unpriced.get(key) ?? 0) + 1);
    };

    for (const slot of slots) {
      if (!slot.serviceTypeId) continue;
      const noFrozen = !slot.frozenPrice || slot.frozenPrice <= 0;
      if (slot.studentId) {
        addLesson(slot.studentId, slot.serviceTypeId, noFrozen);
        continue;
      }
      for (const member of slot.group?.members ?? []) {
        addLesson(member.studentId, slot.serviceTypeId, noFrozen);
      }
    }

    const [students, services, prices] = await Promise.all([
      prisma.student.findMany({
        where: { isActive: true },
        select: { id: true, firstName: true, lastName: true, studentNumber: true, hourlyRate: true },
      }),
      prisma.serviceType.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, kind: true },
      }),
      prisma.studentServicePrice.findMany({ select: { studentId: true, serviceTypeId: true, price: true } }),
    ]);

    const priceMap = new Map(prices.map((p) => [`${p.studentId}|${p.serviceTypeId}`, p.price]));
    const studentMap = new Map(students.map((s) => [s.id, s]));

    const rows = [...lessons.entries()]
      .map(([key, count]) => {
        const [studentId, serviceTypeId] = key.split("|");
        const student = studentMap.get(studentId);
        if (!student) return null; // ученик уже не активен
        const price = priceMap.get(key) ?? null;
        const hasFallback = price != null || (student.hourlyRate ?? 0) > 0;
        return {
          studentId,
          serviceTypeId,
          lessons: count,
          // занятия, которые сейчас дадут ноль: цены нет нигде
          zeroLessons: hasFallback ? 0 : unpriced.get(key) ?? 0,
          price,
          studentName: `${student.lastName} ${student.firstName}`.trim(),
          studentNumber: student.studentNumber,
          hourlyRate: student.hourlyRate,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => {
        // сначала те, чьи занятия уходят в ноль, потом остальные без цены
        if ((b.zeroLessons > 0 ? 1 : 0) !== (a.zeroLessons > 0 ? 1 : 0)) return b.zeroLessons - a.zeroLessons;
        if ((a.price === null) !== (b.price === null)) return a.price === null ? -1 : 1;
        if (b.lessons !== a.lessons) return b.lessons - a.lessons;
        return a.studentName.localeCompare(b.studentName);
      });

    const missing = rows.filter((r) => r.price === null);
    const zeroRows = rows.filter((r) => r.zeroLessons > 0);

    return NextResponse.json({
      fromWeek,
      services,
      rows,
      summary: {
        zeroStudents: new Set(zeroRows.map((r) => r.studentId)).size,
        zeroLessons: zeroRows.reduce((n, r) => n + r.zeroLessons, 0),
        studentsWithoutPrice: new Set(missing.map((r) => r.studentId)).size,
        rowsTotal: rows.length,
      },
    });
  } catch (error) {
    console.error("Не удалось собрать сводку по ценам:", error);
    return NextResponse.json({ error: "Не удалось загрузить цены" }, { status: 500 });
  }
}
