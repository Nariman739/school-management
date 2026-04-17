import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// POST /api/schedule/[id]/transfer — перенести занятие на другой день/время
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { newDayOfWeek, newStartTime, newEndTime, newWeekStartDate } = body;

    const original = await prisma.scheduleSlot.findUnique({ where: { id } });
    if (!original) {
      return NextResponse.json({ error: "Слот не найден" }, { status: 404 });
    }

    // Отменяем оригинальный слот
    await prisma.scheduleSlot.update({
      where: { id },
      data: {
        isCancelled: true,
        cancelReason: `Перенесён на ${newDayOfWeek ? `день ${newDayOfWeek}` : ""} ${newStartTime || ""}`.trim(),
      },
    });

    // Создаём новый слот
    const newSlot = await prisma.scheduleSlot.create({
      data: {
        teacherId: original.teacherId,
        studentId: original.studentId,
        groupId: original.groupId,
        dayOfWeek: newDayOfWeek ?? original.dayOfWeek,
        startTime: newStartTime ?? original.startTime,
        endTime: newEndTime ?? original.endTime,
        weekStartDate: newWeekStartDate ?? original.weekStartDate,
        lessonType: original.lessonType,
        lessonCategory: original.lessonCategory,
        room: original.room,
      },
    });

    await logAudit({
      entityType: "ScheduleSlot",
      entityId: id,
      action: "UPDATE",
      changes: { action: { old: null, new: "transfer" }, newSlotId: { old: null, new: newSlot.id } },
    });

    return NextResponse.json({ original: id, newSlot });
  } catch (error) {
    console.error("Ошибка при переносе занятия:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
