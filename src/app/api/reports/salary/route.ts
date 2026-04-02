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
          where: { status: "ATTENDED" }, // ЗП только за ATTENDED
          include: { substituteTeacher: true, student: true },
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
        behavioralBonus: number;
        methodistBonus: number;
        substitutionTotal: number;
        total: number;
        details: {
          day: number;
          time: string;
          type: string;
          description: string;
          hours: number;
          rate: number;
          sum: number;
          isSubstitution: boolean;
          behavioralExtra: number;
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

    function ensureEntry(teacher: { id: string; lastName: string; firstName: string; patronymic: string | null; individualRate: number; groupRate: number; behavioralBonus: number }) {
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
          behavioralBonus: 0,
          methodistBonus: 0,
          substitutionTotal: 0,
          total: 0,
          details: [],
        });
      }
      return salaryMap.get(teacher.id)!;
    }

    for (const slot of slots) {
      const dateForDay = weekDates.get(slot.dayOfWeek) || "";

      const presentAttendances = slot.attendances.filter(
        (a) => a.date === dateForDay && a.status === "ATTENDED"
      );

      if (presentAttendances.length === 0) continue;

      // Определяем кто реально вёл урок (замена?)
      const firstAtt = presentAttendances[0];
      const isSubstitution = firstAtt.isSubstitution && firstAtt.substituteTeacher;
      const actualTeacher = isSubstitution ? firstAtt.substituteTeacher! : slot.teacher;

      const entry = ensureEntry(actualTeacher);
      const hours = 1;
      const rate =
        slot.lessonType === "INDIVIDUAL"
          ? actualTeacher.individualRate
          : actualTeacher.groupRate;
      const sum = hours * rate;

      // Доплата за поведенческих
      let behavioralExtra = 0;
      for (const att of presentAttendances) {
        if (att.student.isBehavioral && actualTeacher.behavioralBonus > 0) {
          behavioralExtra += actualTeacher.behavioralBonus;
        }
      }

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

      if (isSubstitution) {
        entry.substitutionTotal += sum;
        description += " (замена)";
      }

      entry.behavioralBonus += behavioralExtra;

      entry.details.push({
        day: slot.dayOfWeek,
        time: slot.startTime,
        type: slot.lessonType,
        description,
        hours,
        rate,
        sum: sum + behavioralExtra,
        isSubstitution: !!isSubstitution,
        behavioralExtra,
      });

      entry.total =
        entry.individualTotal +
        entry.groupTotal +
        entry.behavioralBonus +
        entry.methodistBonus;
    }

    // Добавляем методический бонус для методистов
    const allTeachers = await prisma.teacher.findMany({
      where: { isMethodist: true, isActive: true },
    });

    for (const teacher of allTeachers) {
      if (teacher.methodistWeeklyRate > 0) {
        const entry = ensureEntry(teacher);
        entry.methodistBonus = teacher.methodistWeeklyRate;
        entry.total =
          entry.individualTotal +
          entry.groupTotal +
          entry.behavioralBonus +
          entry.methodistBonus;
      }
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
