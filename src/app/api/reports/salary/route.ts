import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Определяем повышенное время суток
function getTimeBonus(startTime: string, teacher: { morningBonusRate: number; eveningBonusRate: number }): number {
  const hour = parseInt(startTime.split(":")[0], 10);
  // Утро: 9:00-10:00
  if (hour === 9 && teacher.morningBonusRate > 0) return teacher.morningBonusRate;
  // Вечер: 17:00-19:00
  if (hour >= 17 && hour < 19 && teacher.eveningBonusRate > 0) return teacher.eveningBonusRate;
  return 0;
}

// Определяем ставку за группу по кол-ву присутствующих
function getGroupRate(
  presentCount: number,
  teacher: { groupRate: number; groupRate3: number; groupRate5: number }
): number {
  if (presentCount >= 5 && teacher.groupRate5 > 0) return teacher.groupRate5;
  if (presentCount >= 3 && teacher.groupRate3 > 0) return teacher.groupRate3;
  return teacher.groupRate; // базовая (1-2 ребёнка)
}

// GET /api/reports/salary?weekStart=2025-01-20
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get("weekStart");

    if (!weekStart) {
      return NextResponse.json({ error: "weekStart обязателен" }, { status: 400 });
    }

    const slots = await prisma.scheduleSlot.findMany({
      where: { weekStartDate: weekStart },
      include: {
        teacher: true,
        student: true,
        group: { include: { members: { include: { student: true } } } },
        attendances: {
          where: { status: "ATTENDED" },
          include: { substituteTeacher: true, assistantTeacher: true, student: true },
        },
      },
    });

    type SalaryEntry = {
      teacherId: string;
      teacherName: string;
      individualHours: number;
      groupHours: number;
      individualTotal: number;
      groupTotal: number;
      behavioralBonus: number;
      timeBonusTotal: number;
      assistantTotal: number;
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
        timeBonus: number;
        behavioralExtra: number;
        sum: number;
        isSubstitution: boolean;
        isAssistant: boolean;
      }[];
    };

    const salaryMap = new Map<string, SalaryEntry>();

    const weekDates = new Map<number, string>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      weekDates.set(i + 1, d.toISOString().split("T")[0]);
    }

    function ensureEntry(teacher: { id: string; lastName: string; firstName: string; patronymic: string | null }): SalaryEntry {
      if (!salaryMap.has(teacher.id)) {
        salaryMap.set(teacher.id, {
          teacherId: teacher.id,
          teacherName: `${teacher.lastName} ${teacher.firstName} ${teacher.patronymic || ""}`.trim(),
          individualHours: 0,
          groupHours: 0,
          individualTotal: 0,
          groupTotal: 0,
          behavioralBonus: 0,
          timeBonusTotal: 0,
          assistantTotal: 0,
          methodistBonus: 0,
          substitutionTotal: 0,
          total: 0,
          details: [],
        });
      }
      return salaryMap.get(teacher.id)!;
    }

    function recalcTotal(entry: SalaryEntry) {
      entry.total =
        entry.individualTotal +
        entry.groupTotal +
        entry.behavioralBonus +
        entry.timeBonusTotal +
        entry.assistantTotal +
        entry.methodistBonus;
    }

    for (const slot of slots) {
      const dateForDay = weekDates.get(slot.dayOfWeek) || "";
      const presentAttendances = slot.attendances.filter(
        (a) => a.date === dateForDay && a.status === "ATTENDED"
      );
      if (presentAttendances.length === 0) continue;

      // Кто реально вёл урок
      const firstAtt = presentAttendances[0];
      const isSubstitution = firstAtt.isSubstitution && firstAtt.substituteTeacher;
      const actualTeacher = isSubstitution ? firstAtt.substituteTeacher! : slot.teacher;

      const entry = ensureEntry(actualTeacher);
      const hours = 1;

      // Ставка: индивидуальная или групповая (с учётом размера)
      let rate: number;
      if (slot.lessonType === "INDIVIDUAL") {
        rate = actualTeacher.individualRate;
      } else {
        rate = getGroupRate(presentAttendances.length, actualTeacher);
      }

      const sum = hours * rate;

      // Бонус за время суток
      const timeBonus = getTimeBonus(slot.startTime, actualTeacher);

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
      entry.timeBonusTotal += timeBonus;

      entry.details.push({
        day: slot.dayOfWeek,
        time: slot.startTime,
        type: slot.lessonType,
        description,
        hours,
        rate,
        timeBonus,
        behavioralExtra,
        sum: sum + timeBonus + behavioralExtra,
        isSubstitution: !!isSubstitution,
        isAssistant: false,
      });

      recalcTotal(entry);

      // Ассистент — если был, начисляем ему отдельно
      const assistantTeacher = firstAtt.assistantTeacher;
      if (assistantTeacher) {
        const assistEntry = ensureEntry(assistantTeacher);
        const assistRate = assistantTeacher.assistantRate || 0;
        const assistTimeBonus = getTimeBonus(slot.startTime, assistantTeacher);

        assistEntry.groupHours += 1;
        assistEntry.assistantTotal += assistRate;
        assistEntry.timeBonusTotal += assistTimeBonus;

        const assistDesc = slot.group
          ? `гр. ${slot.group.name} (ассистент)`
          : `${slot.student?.lastName || ""} (ассистент)`;

        assistEntry.details.push({
          day: slot.dayOfWeek,
          time: slot.startTime,
          type: slot.lessonType,
          description: assistDesc,
          hours: 1,
          rate: assistRate,
          timeBonus: assistTimeBonus,
          behavioralExtra: 0,
          sum: assistRate + assistTimeBonus,
          isSubstitution: false,
          isAssistant: true,
        });

        recalcTotal(assistEntry);
      }
    }

    // Методический час — считаем по дням
    const methodistChecks = await prisma.methodistCheck.findMany({
      where: {
        date: {
          gte: weekStart,
          lte: (() => {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + 6);
            return d.toISOString().split("T")[0];
          })(),
        },
      },
      include: { teacher: true },
    });

    // Группируем по учителю
    const methodistDays = new Map<string, { completed: number; total: number }>();
    for (const check of methodistChecks) {
      const key = check.teacherId;
      if (!methodistDays.has(key)) {
        methodistDays.set(key, { completed: 0, total: 0 });
      }
      const m = methodistDays.get(key)!;
      m.total++;
      if (check.completed) m.completed++;
    }

    // Все методисты
    const allMethodists = await prisma.teacher.findMany({
      where: { isMethodist: true, isActive: true },
    });

    for (const teacher of allMethodists) {
      if (teacher.methodistWeeklyRate > 0) {
        const entry = ensureEntry(teacher);
        const checks = methodistDays.get(teacher.id);

        if (checks && checks.total > 0) {
          // Пропорционально: если из 5 дней был 4, то 4/5 от недельной
          const dailyRate = teacher.methodistDailyRate > 0
            ? teacher.methodistDailyRate
            : Math.round(teacher.methodistWeeklyRate / 5);
          entry.methodistBonus = checks.completed * dailyRate;
        } else {
          // Если нет отметок — считаем полную неделю (по умолчанию)
          entry.methodistBonus = teacher.methodistWeeklyRate;
        }

        recalcTotal(entry);
      }
    }

    const result = Array.from(salaryMap.values()).sort((a, b) =>
      a.teacherName.localeCompare(b.teacherName)
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Ошибка при расчёте зарплаты:", error);
    return NextResponse.json({ error: "Не удалось рассчитать зарплату" }, { status: 500 });
  }
}
