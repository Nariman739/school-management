import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/students/[id]/card — полная карточка ребёнка
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        groupMembers: { include: { group: { include: { teacher: true } } } },
        studentFreezes: { orderBy: { startDate: "desc" } },
        recalculations: { orderBy: { createdAt: "desc" } },
        tariffHistory: { orderBy: { effectiveFrom: "desc" } },
        payments: { orderBy: { date: "desc" }, take: 20 },
      },
    });

    if (!student) {
      return NextResponse.json({ error: "Ученик не найден" }, { status: 404 });
    }

    // Посещаемость за последние 3 месяца
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const fromDate = threeMonthsAgo.toISOString().split("T")[0];

    const attendances = await prisma.attendance.findMany({
      where: { studentId: id, date: { gte: fromDate } },
      include: {
        scheduleSlot: {
          include: { teacher: true },
        },
      },
      orderBy: { date: "desc" },
    });

    // Статистика посещаемости
    const attendanceStats = {
      total: attendances.length,
      attended: attendances.filter((a) => a.status === "ATTENDED" || a.status === "MAKEUP").length,
      absent: attendances.filter((a) => a.status === "ABSENT_NO_REASON" || a.status === "ABSENT").length,
      sick: attendances.filter((a) => a.status === "SICK").length,
      validReason: attendances.filter((a) => a.status === "ABSENT_VALID_REASON").length,
      transferred: attendances.filter((a) => a.status === "TRANSFERRED").length,
    };

    // Баланс: начислено vs оплачено (текущий месяц)
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthStart = `${currentMonth}-01`;
    const monthEnd = `${currentMonth}-31`;

    const monthAttendances = await prisma.attendance.findMany({
      where: {
        studentId: id,
        date: { gte: monthStart, lte: monthEnd },
        status: { in: ["ATTENDED", "ABSENT_NO_REASON", "MAKEUP", "LATE"] },
      },
    });

    const charged = monthAttendances.length * student.hourlyRate;

    const monthPayments = await prisma.payment.findMany({
      where: {
        studentId: id,
        date: { gte: monthStart, lte: monthEnd },
      },
    });
    const paid = monthPayments.reduce((sum, p) => sum + p.amount, 0);

    // Перерасчёты за месяц
    const monthRecalc = await prisma.recalculation.findMany({
      where: { studentId: id, period: currentMonth },
    });
    const recalcTotal = monthRecalc.reduce((sum, r) => sum + r.amount, 0);

    const balance = {
      month: currentMonth,
      charged,
      paid,
      recalculations: recalcTotal,
      debt: charged + recalcTotal - paid,
    };

    return NextResponse.json({
      student,
      attendanceStats,
      recentAttendances: attendances.slice(0, 50).map((a) => ({
        date: a.date,
        time: a.scheduleSlot.startTime,
        status: a.status,
        teacher: `${a.scheduleSlot.teacher.lastName} ${a.scheduleSlot.teacher.firstName}`,
      })),
      balance,
    });
  } catch (error) {
    console.error("Ошибка при получении карточки ученика:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
