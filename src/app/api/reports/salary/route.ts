import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTeacherPaidStatuses } from "@/lib/billing-rules";
import {
  getTimeBonus,
  getGroupRate,
  getPairRate,
  createEmptySalaryEntry,
  recalcTotal,
  calculateBehavioralBonus,
  calculateMethodistBonus,
  getWeekDates,
  type SalaryEntry,
} from "@/lib/salary-calc";
import { buildGroupDisplayName } from "@/lib/group-utils";

// GET /api/reports/salary?weekStart=2025-01-20
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get("weekStart");

    if (!weekStart) {
      return NextResponse.json({ error: "weekStart обязателен" }, { status: 400 });
    }

    const paidStatuses = getTeacherPaidStatuses();

    const slots = await prisma.scheduleSlot.findMany({
      where: { weekStartDate: weekStart },
      include: {
        teacher: true,
        student: true,
        group: { include: { members: { include: { student: true } } } },
        serviceType: true,
        attendances: {
          where: { status: { in: paidStatuses } },
          include: { substituteTeacher: true, assistantTeacher: true, student: true },
        },
      },
    });

    const salaryMap = new Map<string, SalaryEntry>();
    const weekDates = getWeekDates(weekStart);

    function ensureEntry(teacher: { id: string; lastName: string; firstName: string; patronymic: string | null }): SalaryEntry {
      if (!salaryMap.has(teacher.id)) {
        salaryMap.set(teacher.id, createEmptySalaryEntry(teacher));
      }
      return salaryMap.get(teacher.id)!;
    }

    for (const slot of slots) {
      const dateForDay = weekDates.get(slot.dayOfWeek) || "";
      const presentAttendances = slot.attendances.filter(
        (a) => a.date === dateForDay && paidStatuses.includes(a.status)
      );
      if (presentAttendances.length === 0) continue;

      // Кто реально вёл урок
      const firstAtt = presentAttendances[0];
      const isSubstitution = firstAtt.isSubstitution && firstAtt.substituteTeacher;
      const actualTeacher = isSubstitution ? firstAtt.substituteTeacher! : slot.teacher;

      const entry = ensureEntry(actualTeacher);
      const hours = 1;

      // Ставка зависит от типа занятия. Приоритет: serviceType.kind, затем group.groupType, затем lessonType
      const isPair =
        slot.serviceType?.kind === "PAIR" || slot.group?.groupType === "PAIR";
      const isIndividual =
        slot.lessonType === "INDIVIDUAL" || slot.group?.groupType === "INDIVIDUAL";

      let rate: number;
      if (isPair) {
        rate = getPairRate(actualTeacher);
      } else if (isIndividual) {
        rate = actualTeacher.individualRate;
      } else {
        rate = getGroupRate(presentAttendances.length, actualTeacher);
      }

      const sum = hours * rate;
      const timeBonus = getTimeBonus(slot.startTime, actualTeacher);
      const behavioralExtra = calculateBehavioralBonus(
        presentAttendances.map((a) => a.student),
        actualTeacher.behavioralBonus
      );

      let description = "";
      if (isPair && slot.group) {
        description = `пара: ${buildGroupDisplayName(slot.group)}`;
        entry.pairHours += hours;
        entry.pairTotal += sum;
      } else if (isIndividual && slot.student) {
        description = `${slot.student.lastName} ${slot.student.firstName}`;
        entry.individualHours += hours;
        entry.individualTotal += sum;
      } else if (slot.group) {
        const groupLabel = buildGroupDisplayName(slot.group);
        description = `гр. ${groupLabel} (${presentAttendances.length} уч.)`;
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

      // Ассистент
      const assistantTeacher = firstAtt.assistantTeacher;
      if (assistantTeacher) {
        const assistEntry = ensureEntry(assistantTeacher);
        const assistRate = assistantTeacher.assistantRate || 0;
        const assistTimeBonus = getTimeBonus(slot.startTime, assistantTeacher);

        assistEntry.groupHours += 1;
        assistEntry.assistantTotal += assistRate;
        assistEntry.timeBonusTotal += assistTimeBonus;

        const assistDesc = slot.group
          ? `гр. ${buildGroupDisplayName(slot.group)} (ассистент)`
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

    // Методический час
    const weekEnd = (() => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + 6);
      return d.toISOString().split("T")[0];
    })();

    const methodistChecks = await prisma.methodistCheck.findMany({
      where: { date: { gte: weekStart, lte: weekEnd } },
      include: { teacher: true },
    });

    const methodistDays = new Map<string, { completed: number; total: number }>();
    for (const check of methodistChecks) {
      if (!methodistDays.has(check.teacherId)) {
        methodistDays.set(check.teacherId, { completed: 0, total: 0 });
      }
      const m = methodistDays.get(check.teacherId)!;
      m.total++;
      if (check.completed) m.completed++;
    }

    const allMethodists = await prisma.teacher.findMany({
      where: { isMethodist: true, isActive: true },
    });

    for (const teacher of allMethodists) {
      if (teacher.methodistWeeklyRate > 0) {
        const entry = ensureEntry(teacher);
        entry.methodistBonus = calculateMethodistBonus(
          teacher,
          methodistDays.get(teacher.id)
        );
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
