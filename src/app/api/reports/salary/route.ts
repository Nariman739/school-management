import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/reports/salary?weekStart=2025-01-20
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get("weekStart");

    if (!weekStart) {
      return NextResponse.json(
        { error: "weekStart обязателен" },
        { status: 400 }
      );
    }

    // Получаем все слоты на эту неделю с посещаемостью
    const slots = await prisma.scheduleSlot.findMany({
      where: { weekStartDate: weekStart },
      include: {
        teacher: true,
        student: true,
        group: {
          include: { members: { include: { student: true } } },
        },
        attendances: {
          where: { isPresent: true },
        },
      },
    });

    // Считаем зарплату по учителям
    const salaryMap = new Map<
      string,
      {
        teacherId: string;
        teacherName: string;
        individualHours: number;
        groupHours: number;
        individualRate: number;
        groupRate: number;
        individualTotal: number;
        groupTotal: number;
        total: number;
        details: {
          day: number;
          time: string;
          type: string;
          description: string;
          hours: number;
          rate: number;
          sum: number;
        }[];
      }
    >();

    // Вычисляем даты для каждого дня недели
    const weekDates = new Map<number, string>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      weekDates.set(i + 1, d.toISOString().split("T")[0]);
    }

    for (const slot of slots) {
      const teacher = slot.teacher;
      const dateForDay = weekDates.get(slot.dayOfWeek) || "";

      // Проверяем, были ли ученики на этом занятии
      const presentAttendances = slot.attendances.filter(
        (a) => a.date === dateForDay && a.isPresent
      );

      // Если никого не было — пропускаем
      if (presentAttendances.length === 0) continue;

      if (!salaryMap.has(teacher.id)) {
        salaryMap.set(teacher.id, {
          teacherId: teacher.id,
          teacherName: `${teacher.lastName} ${teacher.firstName} ${teacher.patronymic || ""}`.trim(),
          individualHours: 0,
          groupHours: 0,
          individualRate: teacher.individualRate,
          groupRate: teacher.groupRate,
          individualTotal: 0,
          groupTotal: 0,
          total: 0,
          details: [],
        });
      }

      const entry = salaryMap.get(teacher.id)!;
      const hours = 1; // 1 час за слот
      const rate =
        slot.lessonType === "INDIVIDUAL"
          ? teacher.individualRate
          : teacher.groupRate;
      const sum = hours * rate;

      let description = "";
      if (slot.lessonType === "INDIVIDUAL" && slot.student) {
        description = `${slot.student.lastName} ${slot.student.firstName}`;
        entry.individualHours += hours;
        entry.individualTotal += sum;
      } else if (slot.group) {
        description = `гр. ${slot.group.name} (${presentAttendances.length} уч.)`;
        entry.groupHours += hours;
        entry.groupTotal += sum;
      }

      entry.details.push({
        day: slot.dayOfWeek,
        time: slot.startTime,
        type: slot.lessonType,
        description,
        hours,
        rate,
        sum,
      });

      entry.total = entry.individualTotal + entry.groupTotal;
    }

    const result = Array.from(salaryMap.values()).sort((a, b) =>
      a.teacherName.localeCompare(b.teacherName)
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Ошибка при расчёте зарплаты:", error);
    return NextResponse.json(
      { error: "Не удалось рассчитать зарплату" },
      { status: 500 }
    );
  }
}
