import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTeacherPaidStatuses } from "@/lib/billing-rules";
import {
  getTimeBonus,
  getGroupRate,
  createEmptySalaryEntry,
  recalcTotal,
  calculateBehavioralBonus,
  calculateMethodistBonus,
  getWeekDates,
  type SalaryEntry,
} from "@/lib/salary-calc";
import { generateExcel, excelResponse } from "@/lib/excel-export";

const DAYS = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

// GET /api/reports/salary/export?weekStart=2025-01-20
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get("weekStart");

    if (!weekStart) {
      return new Response("weekStart обязателен", { status: 400 });
    }

    const paidStatuses = getTeacherPaidStatuses();

    const slots = await prisma.scheduleSlot.findMany({
      where: { weekStartDate: weekStart },
      include: {
        teacher: true,
        student: true,
        group: { include: { members: { include: { student: true } } } },
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

      const firstAtt = presentAttendances[0];
      const isSubstitution = firstAtt.isSubstitution && firstAtt.substituteTeacher;
      const actualTeacher = isSubstitution ? firstAtt.substituteTeacher! : slot.teacher;

      const entry = ensureEntry(actualTeacher);
      const hours = 1;

      let rate: number;
      if (slot.lessonType === "INDIVIDUAL") {
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
        entry.methodistBonus = calculateMethodistBonus(teacher, methodistDays.get(teacher.id));
        recalcTotal(entry);
      }
    }

    const entries = Array.from(salaryMap.values()).sort((a, b) =>
      a.teacherName.localeCompare(b.teacherName)
    );

    // Формируем Excel — детальные строки по всем педагогам
    const excelRows: Record<string, unknown>[] = [];
    let grandTotal = 0;

    for (const entry of entries) {
      // Заголовок педагога
      excelRows.push({
        teacher: entry.teacherName,
        day: "",
        time: "",
        description: "",
        hours: "",
        rate: "",
        timeBonus: "",
        behavioral: "",
        sum: "",
      });

      for (const d of entry.details) {
        excelRows.push({
          teacher: "",
          day: DAYS[d.day] || d.day,
          time: d.time,
          description: d.description,
          hours: d.hours,
          rate: d.rate,
          timeBonus: d.timeBonus || "",
          behavioral: d.behavioralExtra || "",
          sum: d.sum,
        });
      }

      if (entry.methodistBonus > 0) {
        excelRows.push({
          teacher: "",
          day: "",
          time: "",
          description: "Методический час",
          hours: "",
          rate: "",
          timeBonus: "",
          behavioral: "",
          sum: entry.methodistBonus,
        });
      }

      // Итого по педагогу
      excelRows.push({
        teacher: "",
        day: "",
        time: "",
        description: "ИТОГО",
        hours: entry.individualHours + entry.groupHours,
        rate: "",
        timeBonus: entry.timeBonusTotal || "",
        behavioral: entry.behavioralBonus || "",
        sum: entry.total,
      });

      excelRows.push({}); // пустая строка
      grandTotal += entry.total;
    }

    const buffer = generateExcel({
      columns: [
        { header: "Педагог", key: "teacher", width: 25 },
        { header: "День", key: "day", width: 6 },
        { header: "Время", key: "time", width: 8 },
        { header: "Описание", key: "description", width: 30 },
        { header: "Часы", key: "hours", width: 6 },
        { header: "Ставка", key: "rate", width: 10 },
        { header: "Бонус время", key: "timeBonus", width: 12 },
        { header: "Поведенч.", key: "behavioral", width: 12 },
        { header: "Сумма", key: "sum", width: 12 },
      ],
      rows: excelRows,
      sheetName: "Зарплата",
      title: `Зарплата за неделю ${weekStart}`,
      totals: {
        teacher: "",
        day: "",
        time: "",
        description: "ОБЩИЙ ИТОГО",
        hours: "",
        rate: "",
        timeBonus: "",
        behavioral: "",
        sum: grandTotal,
      },
    });

    return excelResponse(buffer, `Зарплата_${weekStart}.xlsx`);
  } catch (error) {
    console.error("Ошибка при экспорте зарплаты:", error);
    return new Response("Ошибка экспорта", { status: 500 });
  }
}
