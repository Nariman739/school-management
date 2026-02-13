import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/reports/billing?weekStart=2025-01-20
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

    // Получаем все записи посещаемости за неделю (только присутствовавшие)
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
          include: { student: true },
        },
      },
    });

    // Вычисляем даты для каждого дня недели
    const weekDates = new Map<number, string>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      weekDates.set(i + 1, d.toISOString().split("T")[0]);
    }

    // Считаем счёт по ученикам
    const billingMap = new Map<
      string,
      {
        studentId: string;
        studentName: string;
        parentName: string;
        parentPhone: string;
        hourlyRate: number;
        totalHours: number;
        totalAmount: number;
        details: {
          day: number;
          time: string;
          teacherName: string;
          type: string;
        }[];
      }
    >();

    for (const slot of slots) {
      const dateForDay = weekDates.get(slot.dayOfWeek) || "";

      for (const attendance of slot.attendances) {
        if (attendance.date !== dateForDay) continue;

        const student = attendance.student;

        if (!billingMap.has(student.id)) {
          billingMap.set(student.id, {
            studentId: student.id,
            studentName: `${student.lastName} ${student.firstName}`,
            parentName: student.parentName || "—",
            parentPhone: student.parentPhone || "—",
            hourlyRate: student.hourlyRate,
            totalHours: 0,
            totalAmount: 0,
            details: [],
          });
        }

        const entry = billingMap.get(student.id)!;
        entry.totalHours += 1;
        entry.totalAmount = entry.totalHours * entry.hourlyRate;

        entry.details.push({
          day: slot.dayOfWeek,
          time: slot.startTime,
          teacherName: `${slot.teacher.lastName} ${slot.teacher.firstName}`,
          type: slot.lessonType,
        });
      }
    }

    const result = Array.from(billingMap.values()).sort((a, b) =>
      a.studentName.localeCompare(b.studentName)
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Ошибка при расчёте счёта:", error);
    return NextResponse.json(
      { error: "Не удалось рассчитать счёт" },
      { status: 500 }
    );
  }
}
