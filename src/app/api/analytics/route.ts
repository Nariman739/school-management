import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/analytics?months=3 — аналитика за N месяцев
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const months = parseInt(searchParams.get("months") || "3", 10);

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // === KPI ===
    const activeStudents = await prisma.student.count({ where: { isActive: true } });
    const activeTeachers = await prisma.teacher.count({ where: { isActive: true } });
    const totalGroups = await prisma.group.count();

    // Начало периода
    const periodStart = new Date(now);
    periodStart.setMonth(periodStart.getMonth() - months);
    const fromDate = periodStart.toISOString().split("T")[0];

    // Все посещения за период
    const allAttendances = await prisma.attendance.findMany({
      where: { date: { gte: fromDate } },
      select: { date: true, status: true, studentId: true },
    });

    const totalLessons = allAttendances.length;
    const attendedLessons = allAttendances.filter((a) => a.status === "ATTENDED" || a.status === "MAKEUP").length;
    const attendancePct = totalLessons > 0 ? Math.round((attendedLessons / totalLessons) * 100) : 0;

    // Оплаты за период
    const periodPayments = await prisma.payment.findMany({
      where: { date: { gte: fromDate } },
      select: { amount: true, date: true },
    });
    const totalRevenue = periodPayments.reduce((sum, p) => sum + p.amount, 0);

    // Средний чек
    const avgCheck = periodPayments.length > 0 ? Math.round(totalRevenue / periodPayments.length) : 0;

    // === Выручка по месяцам (для графика) ===
    const revenueByMonth: { month: string; revenue: number; payments: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const mStart = `${m}-01`;
      const mEnd = `${m}-31`;

      const monthPayments = periodPayments.filter((p) => p.date >= mStart && p.date <= mEnd);
      revenueByMonth.push({
        month: m,
        revenue: monthPayments.reduce((sum, p) => sum + p.amount, 0),
        payments: monthPayments.length,
      });
    }

    // === Посещаемость по месяцам (для графика) ===
    const attendanceByMonth: { month: string; attended: number; absent: number; sick: number; total: number; pct: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const mStart = `${m}-01`;
      const mEnd = `${m}-31`;

      const monthAtt = allAttendances.filter((a) => a.date >= mStart && a.date <= mEnd);
      const att = monthAtt.filter((a) => a.status === "ATTENDED" || a.status === "MAKEUP").length;
      const absent = monthAtt.filter((a) => ["ABSENT_NO_REASON", "ABSENT", "ABSENT_VALID_REASON"].includes(a.status)).length;
      const sick = monthAtt.filter((a) => a.status === "SICK").length;

      attendanceByMonth.push({
        month: m,
        attended: att,
        absent,
        sick,
        total: monthAtt.length,
        pct: monthAtt.length > 0 ? Math.round((att / monthAtt.length) * 100) : 0,
      });
    }

    // === Нагрузка педагогов (топ-10) ===
    const teacherAttendances = await prisma.attendance.findMany({
      where: {
        date: { gte: `${currentMonth}-01`, lte: `${currentMonth}-31` },
        status: { in: ["ATTENDED", "MAKEUP"] },
      },
      include: {
        scheduleSlot: { select: { teacherId: true, teacher: { select: { lastName: true, firstName: true } } } },
        substituteTeacher: { select: { id: true, lastName: true, firstName: true } },
      },
    });

    const teacherHoursMap = new Map<string, { name: string; hours: number }>();
    for (const att of teacherAttendances) {
      const teacher = att.isSubstitution && att.substituteTeacher
        ? att.substituteTeacher
        : att.scheduleSlot.teacher;
      const key = att.isSubstitution && att.substituteTeacher ? att.substituteTeacher.id : att.scheduleSlot.teacherId;
      if (!teacherHoursMap.has(key)) {
        teacherHoursMap.set(key, { name: `${teacher.lastName} ${teacher.firstName}`, hours: 0 });
      }
      teacherHoursMap.get(key)!.hours++;
    }
    const teacherLoad = Array.from(teacherHoursMap.values())
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10);

    // === Дети с риском оттока (3+ пропуска подряд) ===
    const lastMonth = new Date(now);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthStr = lastMonth.toISOString().split("T")[0];

    const recentAttendances = await prisma.attendance.findMany({
      where: { date: { gte: lastMonthStr } },
      select: { studentId: true, date: true, status: true },
      orderBy: { date: "asc" },
    });

    // Группируем по ученику, ищем 3+ подряд отсутствий
    const studentStreaks = new Map<string, number>();
    const studentMaxStreaks = new Map<string, number>();

    for (const att of recentAttendances) {
      const current = studentStreaks.get(att.studentId) || 0;
      if (["ABSENT_NO_REASON", "ABSENT", "ABSENT_VALID_REASON", "SICK"].includes(att.status)) {
        studentStreaks.set(att.studentId, current + 1);
      } else {
        const max = studentMaxStreaks.get(att.studentId) || 0;
        if (current > max) studentMaxStreaks.set(att.studentId, current);
        studentStreaks.set(att.studentId, 0);
      }
    }
    // Финализируем
    for (const [sid, streak] of studentStreaks) {
      const max = studentMaxStreaks.get(sid) || 0;
      if (streak > max) studentMaxStreaks.set(sid, streak);
    }

    const atRiskIds = Array.from(studentMaxStreaks.entries())
      .filter(([, streak]) => streak >= 3)
      .map(([id]) => id);

    const atRiskStudents = atRiskIds.length > 0
      ? await prisma.student.findMany({
          where: { id: { in: atRiskIds }, isActive: true },
          select: { id: true, lastName: true, firstName: true },
        })
      : [];

    const churnRisk = atRiskStudents.map((s) => ({
      id: s.id,
      name: `${s.lastName} ${s.firstName}`,
      streak: studentMaxStreaks.get(s.id) || 0,
    })).sort((a, b) => b.streak - a.streak);

    return NextResponse.json({
      kpi: {
        activeStudents,
        activeTeachers,
        totalGroups,
        attendancePct,
        totalRevenue,
        avgCheck,
        totalLessons,
        attendedLessons,
      },
      revenueByMonth,
      attendanceByMonth,
      teacherLoad,
      churnRisk,
    });
  } catch (error) {
    console.error("Ошибка аналитики:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
