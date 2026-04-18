import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// POST /api/students/[id]/recalculation — создать перерасчёт
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { amount, reason, period } = body;

    if (!amount || !reason || !period) {
      return NextResponse.json(
        { error: "amount, reason и period обязательны" },
        { status: 400 }
      );
    }

    const recalc = await prisma.recalculation.create({
      data: {
        studentId: id,
        amount: Math.round(Number(amount)),
        reason,
        period,
      },
    });

    await logAudit({
      entityType: "Recalculation",
      entityId: recalc.id,
      action: "CREATE",
      changes: { studentId: { old: null, new: id }, amount: { old: null, new: amount }, period: { old: null, new: period } },
    });

    return NextResponse.json(recalc, { status: 201 });
  } catch (error) {
    console.error("Ошибка при создании перерасчёта:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
