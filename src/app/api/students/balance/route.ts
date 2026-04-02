import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/students/balance?month=2025-01 — баланс всех учеников за месяц
// Долг = начислено (по посещаемости) - оплачено (payments)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month"); // "2025-01"

    if (!month) {
      return NextResponse.json({ error: "month обязателен (YYYY-MM)" }, { status: 400 });
    }

    // Все активные ученики
    const students = await prisma.student.findMany({
      where: { isActive: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    // Все записи посещаемости за месяц где ребёнок должен платить
    // ATTENDED → платит, LATE → платит, SICK → не платит, ABSENT → не платит
    const attendances = await prisma.attendance.findMany({
      where: {
        date: { startsWith: month },
        status: { in: ["ATTENDED", "LATE"] },
      },
      include: {
        student: true,
        scheduleSlot: true,
      },
    });

    // Считаем начисления по ученикам
    const chargesMap = new Map<string, number>();
    for (const att of attendances) {
      const prev = chargesMap.get(att.studentId) || 0;
      chargesMap.set(att.studentId, prev + att.student.hourlyRate);
    }

    // Все оплаты за месяц
    const payments = await prisma.payment.findMany({
      where: { date: { startsWith: month } },
    });

    const paymentsMap = new Map<string, number>();
    for (const p of payments) {
      const prev = paymentsMap.get(p.studentId) || 0;
      paymentsMap.set(p.studentId, prev + p.amount);
    }

    const result = students.map((s) => {
      const charged = chargesMap.get(s.id) || 0;
      const paid = paymentsMap.get(s.id) || 0;
      const balance = paid - charged; // положительный = переплата, отрицательный = долг

      return {
        studentId: s.id,
        studentName: `${s.lastName} ${s.firstName}`,
        parentName: s.parentName || "—",
        parentPhone: s.parentPhone || "—",
        hourlyRate: s.hourlyRate,
        charged,
        paid,
        balance,
      };
    });

    // Только тех кто имеет начисления или оплаты
    const filtered = result.filter((r) => r.charged > 0 || r.paid > 0);

    return NextResponse.json(filtered);
  } catch (error) {
    console.error("Ошибка при расчёте баланса:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
