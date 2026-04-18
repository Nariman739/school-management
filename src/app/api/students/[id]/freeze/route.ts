import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// POST /api/students/[id]/freeze — создать заморозку ученика
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { startDate, endDate, reason, type } = body;

    if (!startDate || !endDate || !reason) {
      return NextResponse.json(
        { error: "startDate, endDate и reason обязательны" },
        { status: 400 }
      );
    }

    const freeze = await prisma.studentFreeze.create({
      data: {
        studentId: id,
        startDate,
        endDate,
        reason,
        type: type || "OTHER",
      },
    });

    await logAudit({
      entityType: "StudentFreeze",
      entityId: freeze.id,
      action: "CREATE",
      changes: { studentId: { old: null, new: id }, startDate: { old: null, new: startDate }, endDate: { old: null, new: endDate } },
    });

    return NextResponse.json(freeze, { status: 201 });
  } catch (error) {
    console.error("Ошибка при создании заморозки:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// DELETE /api/students/[id]/freeze?freezeId=xxx
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params;
    const { searchParams } = new URL(request.url);
    const freezeId = searchParams.get("freezeId");

    if (!freezeId) {
      return NextResponse.json({ error: "freezeId обязателен" }, { status: 400 });
    }

    await prisma.studentFreeze.delete({ where: { id: freezeId } });
    await logAudit({ entityType: "StudentFreeze", entityId: freezeId, action: "DELETE" });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Ошибка при удалении заморозки:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
