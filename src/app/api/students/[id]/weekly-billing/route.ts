import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveServicePrice } from "@/lib/pricing";
import { DAY_GROUPS, getMonday } from "@/lib/schedule-utils";

// GET /api/students/[id]/weekly-billing?weekStart=YYYY-MM-DD
// Возвращает часы и оплату ученика по группам дней (Пн/Ср/Пт, Вт/Чт, Сб)
// с суммой за один день × количество дней и еженедельным итогом.
//
// Мотивация: Дархан ведёт в Excel «финансовое расписание» — прайс каждого дня по
// категориям (И/А/Тех) и умножение на количество дней недели. Это отдельная сущность
// от «Расписания» (там персональные слоты по дням).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get("weekStart") || getMonday(new Date());

    const student = await prisma.student.findUnique({
      where: { id },
      select: { id: true, hourlyRate: true },
    });
    if (!student) {
      return NextResponse.json({ error: "Ученик не найден" }, { status: 404 });
    }

    // Группы, в которых состоит ученик (для legacy слотов без SlotAttendee)
    const memberships = await prisma.groupMember.findMany({
      where: { studentId: id },
      select: { groupId: true },
    });
    const groupIds = memberships.map((m) => m.groupId);

    // Все слоты ученика на неделю (та же логика, что в /schedule)
    const slots = await prisma.scheduleSlot.findMany({
      where: {
        weekStartDate: weekStart,
        isCancelled: false,
        OR: [
          { studentId: id },
          { attendees: { some: { studentId: id } } },
          ...(groupIds.length > 0
            ? [{ groupId: { in: groupIds }, attendees: { none: {} } }]
            : []),
        ],
      },
      include: {
        teacher: {
          select: { id: true, firstName: true, lastName: true, patronymic: true },
        },
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });

    // Резолвим цены заранее для скорости (parallel)
    const pricedSlots = await Promise.all(
      slots.map(async (s) => {
        let price = s.frozenPrice ?? 0;
        if (!price || price <= 0) {
          const resolved = await resolveServicePrice(id, s.serviceTypeId);
          price = resolved && resolved > 0 ? resolved : student.hourlyRate;
        }
        return {
          id: s.id,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          category: s.lessonCategory,
          price,
          teacher: `${s.teacher.lastName} ${s.teacher.firstName[0] ?? ""}${
            s.teacher.firstName.length > 1 ? "." : ""
          }`.trim(),
          teacherFull: `${s.teacher.lastName} ${s.teacher.firstName}${
            s.teacher.patronymic ? ` ${s.teacher.patronymic}` : ""
          }`,
        };
      })
    );

    // Группируем по DAY_GROUPS. Для каждой группы берём слоты одного дня
    // (первого попавшегося в группе, где есть слоты) — Дархан ведёт единый
    // прайс на все дни группы. Если внутри группы дни различаются — берём
    // максимальное количество слотов из одного дня.
    const groups = DAY_GROUPS.map((g) => {
      // Найдём день с наибольшим количеством слотов внутри группы —
      // это репрезентативный «шаблон» дня
      const daySlotsCount = g.days.map((d) => ({
        day: d,
        count: pricedSlots.filter((s) => s.dayOfWeek === d).length,
      }));
      const bestDay = daySlotsCount.sort((a, b) => b.count - a.count)[0];
      const templateSlots = pricedSlots.filter((s) => s.dayOfWeek === bestDay.day);

      // Считаем «реальное» количество дней недели, где есть занятия
      const daysWithSlots = g.days.filter((d) =>
        pricedSlots.some((s) => s.dayOfWeek === d)
      );
      const daysCount = daysWithSlots.length;

      const daySum = templateSlots.reduce((sum, s) => sum + s.price, 0);
      const weekSum = daySum * daysCount;

      return {
        dayGroup: g.id,
        label: g.label,
        daysCount,
        daysActive: daysWithSlots,
        slots: templateSlots.map((s) => ({
          startTime: s.startTime,
          endTime: s.endTime,
          category: s.category,
          price: s.price,
          teacher: s.teacher,
          teacherFull: s.teacherFull,
        })),
        daySum,
        weekSum,
      };
    });

    const weeklyTotal = groups.reduce((sum, g) => sum + g.weekSum, 0);

    return NextResponse.json({
      weekStart,
      groups,
      weeklyTotal,
    });
  } catch (error) {
    console.error("Ошибка при расчёте недельного биллинга:", error);
    return NextResponse.json(
      { error: "Не удалось рассчитать биллинг" },
      { status: 500 }
    );
  }
}
