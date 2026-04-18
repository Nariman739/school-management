import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/reports/financial?month=2025-04
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");

    if (!month) {
      return NextResponse.json({ error: "month обязателен (YYYY-MM)" }, { status: 400 });
    }

    const monthStart = `${month}-01`;
    const monthEnd = `${month}-31`;

    // Выручка: все оплаты за месяц
    const payments = await prisma.payment.findMany({
      where: { date: { gte: monthStart, lte: monthEnd } },
      include: { student: true },
    });
    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);

    // Начислено: посещаемость с оплачиваемыми статусами
    const billableAttendances = await prisma.attendance.findMany({
      where: {
        date: { gte: monthStart, lte: monthEnd },
        status: { in: ["ATTENDED", "ABSENT_NO_REASON", "MAKEUP", "LATE"] },
      },
      include: { student: true },
    });

    const chargedByStudent = new Map<string, { name: string; charged: number; paid: number }>();

    for (const att of billableAttendances) {
      const key = att.studentId;
      if (!chargedByStudent.has(key)) {
        chargedByStudent.set(key, {
          name: `${att.student.lastName} ${att.student.firstName}`,
          charged: 0,
          paid: 0,
        });
      }
      chargedByStudent.get(key)!.charged += att.student.hourlyRate;
    }

    for (const p of payments) {
      const key = p.studentId;
      if (!chargedByStudent.has(key)) {
        chargedByStudent.set(key, {
          name: `${p.student.lastName} ${p.student.firstName}`,
          charged: 0,
          paid: 0,
        });
      }
      chargedByStudent.get(key)!.paid += p.amount;
    }

    const totalCharged = Array.from(chargedByStudent.values()).reduce((sum, s) => sum + s.charged, 0);

    // Перерасчёты
    const recalculations = await prisma.recalculation.findMany({
      where: { period: month },
    });
    const totalRecalc = recalculations.reduce((sum, r) => sum + r.amount, 0);

    // Долги: начислено + перерасчёт - оплачено
    const debts = Array.from(chargedByStudent.entries())
      .map(([studentId, data]) => ({
        studentId,
        ...data,
        debt: data.charged - data.paid,
      }))
      .filter((d) => d.debt > 0)
      .sort((a, b) => b.debt - a.debt);

    const totalDebt = debts.reduce((sum, d) => sum + d.debt, 0);

    // ФОТ: зарплаты за недели в этом месяце (приблизительно)
    // Считаем все ATTENDED за месяц с учителями
    const teacherAttendances = await prisma.attendance.findMany({
      where: {
        date: { gte: monthStart, lte: monthEnd },
        status: { in: ["ATTENDED", "MAKEUP"] },
      },
      include: {
        scheduleSlot: { include: { teacher: true } },
        substituteTeacher: true,
      },
    });

    const teacherHours = new Map<string, { name: string; hours: number }>();
    for (const att of teacherAttendances) {
      const teacher = att.isSubstitution && att.substituteTeacher
        ? att.substituteTeacher
        : att.scheduleSlot.teacher;
      const key = teacher.id;
      if (!teacherHours.has(key)) {
        teacherHours.set(key, { name: `${teacher.lastName} ${teacher.firstName}`, hours: 0 });
      }
      teacherHours.get(key)!.hours++;
    }

    // Активные ученики
    const activeStudents = await prisma.student.count({ where: { isActive: true } });

    return NextResponse.json({
      month,
      summary: {
        totalRevenue,
        totalCharged,
        totalDebt,
        totalRecalc,
        activeStudents,
        paymentCount: payments.length,
      },
      debts: debts.slice(0, 30),
      teacherLoad: Array.from(teacherHours.values())
        .sort((a, b) => b.hours - a.hours)
        .slice(0, 20),
    });
  } catch (error) {
    console.error("Ошибка финансового отчёта:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
