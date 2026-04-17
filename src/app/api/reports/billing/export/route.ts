import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getParentPayStatuses } from "@/lib/billing-rules";
import { getWeekDates } from "@/lib/salary-calc";
import { generateExcel, excelResponse } from "@/lib/excel-export";

const DAYS = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

// GET /api/reports/billing/export?weekStart=2025-01-20
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get("weekStart");

    if (!weekStart) {
      return new Response("weekStart обязателен", { status: 400 });
    }

    const parentPayStatuses = getParentPayStatuses();

    const slots = await prisma.scheduleSlot.findMany({
      where: { weekStartDate: weekStart },
      include: {
        teacher: true,
        student: true,
        group: {
          include: { members: { include: { student: true } } },
        },
        attendances: {
          where: { status: { in: parentPayStatuses } },
          include: { student: true },
        },
      },
    });

    const weekDates = getWeekDates(weekStart);

    const billingMap = new Map<
      string,
      {
        studentName: string;
        parentName: string;
        parentPhone: string;
        hourlyRate: number;
        totalHours: number;
        totalAmount: number;
      }
    >();

    for (const slot of slots) {
      const dateForDay = weekDates.get(slot.dayOfWeek) || "";

      for (const attendance of slot.attendances) {
        if (attendance.date !== dateForDay) continue;

        const student = attendance.student;
        if (!billingMap.has(student.id)) {
          billingMap.set(student.id, {
            studentName: `${student.lastName} ${student.firstName}`,
            parentName: student.parentName || "—",
            parentPhone: student.parentPhone || "—",
            hourlyRate: student.hourlyRate,
            totalHours: 0,
            totalAmount: 0,
          });
        }

        const entry = billingMap.get(student.id)!;
        entry.totalHours += 1;
        entry.totalAmount = entry.totalHours * entry.hourlyRate;
      }
    }

    const entries = Array.from(billingMap.values()).sort((a, b) =>
      a.studentName.localeCompare(b.studentName)
    );

    let totalSum = 0;
    let totalHours = 0;
    const excelRows = entries.map((e) => {
      totalSum += e.totalAmount;
      totalHours += e.totalHours;
      return {
        student: e.studentName,
        parent: e.parentName,
        phone: e.parentPhone,
        rate: e.hourlyRate,
        hours: e.totalHours,
        amount: e.totalAmount,
      };
    });

    const buffer = generateExcel({
      columns: [
        { header: "Ученик", key: "student", width: 25 },
        { header: "Родитель", key: "parent", width: 25 },
        { header: "Телефон", key: "phone", width: 15 },
        { header: "Ставка ₸/час", key: "rate", width: 12 },
        { header: "Часов", key: "hours", width: 8 },
        { header: "Сумма ₸", key: "amount", width: 12 },
      ],
      rows: excelRows,
      sheetName: "Биллинг",
      title: `Счёт родителям за неделю ${weekStart}`,
      totals: {
        student: "",
        parent: "",
        phone: "ИТОГО:",
        rate: "",
        hours: totalHours,
        amount: totalSum,
      },
    });

    return excelResponse(buffer, `Биллинг_${weekStart}.xlsx`);
  } catch (error) {
    console.error("Ошибка при экспорте биллинга:", error);
    return new Response("Ошибка экспорта", { status: 500 });
  }
}
