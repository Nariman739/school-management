import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// PATCH /api/schedule/[id]/cancel — отменить занятие
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { reason } = body;

    const slot = await prisma.scheduleSlot.update({
      where: { id },
      data: {
        isCancelled: true,
        cancelReason: reason || "Отменено",
      },
    });

    await logAudit({
      entityType: "ScheduleSlot",
      entityId: id,
      action: "UPDATE",
      changes: { isCancelled: { old: false, new: true }, reason: { old: null, new: reason } },
    });

    return NextResponse.json(slot);
  } catch (error) {
    console.error("Ошибка при отмене занятия:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
