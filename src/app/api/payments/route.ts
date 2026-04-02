import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/payments?studentId=xxx — история оплат ученика
// GET /api/payments — все оплаты (последние 100)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");

    const where = studentId ? { studentId } : {};

    const payments = await prisma.payment.findMany({
      where,
      include: { student: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(
      payments.map((p) => ({
        id: p.id,
        studentId: p.studentId,
        studentName: `${p.student.lastName} ${p.student.firstName}`,
        amount: p.amount,
        date: p.date,
        note: p.note,
        createdAt: p.createdAt,
      }))
    );
  } catch (error) {
    console.error("Ошибка при получении оплат:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// POST /api/payments — внести оплату
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studentId, amount, date, note } = body;

    if (!studentId || !amount || !date) {
      return NextResponse.json(
        { error: "studentId, amount и date обязательны" },
        { status: 400 }
      );
    }

    const payment = await prisma.payment.create({
      data: {
        studentId,
        amount: Math.round(Number(amount)),
        date,
        note: note || null,
      },
    });

    return NextResponse.json(payment);
  } catch (error) {
    console.error("Ошибка при внесении оплаты:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// DELETE /api/payments?id=xxx — удалить оплату
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id обязателен" }, { status: 400 });
    }

    await prisma.payment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Ошибка при удалении оплаты:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
