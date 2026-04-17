import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// POST /api/schedule/extend — массовое продление расписания
// { fromWeek: "2025-01-20", weeks: 4 } — продлить на 4 недели вперёд
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fromWeek, weeks } = body;

    if (!fromWeek || !weeks || weeks < 1 || weeks > 12) {
      return NextResponse.json(
        { error: "fromWeek обязателен, weeks: 1-12" },
        { status: 400 }
      );
    }

    const sourceSlots = await prisma.scheduleSlot.findMany({
      where: { weekStartDate: fromWeek, isCancelled: false },
    });

    if (sourceSlots.length === 0) {
      return NextResponse.json(
        { error: "На исходной неделе нет расписания" },
        { status: 404 }
      );
    }

    let totalCreated = 0;
    const skippedWeeks: string[] = [];

    for (let w = 1; w <= weeks; w++) {
      const targetDate = new Date(fromWeek);
      targetDate.setDate(targetDate.getDate() + 7 * w);
      const targetWeek = targetDate.toISOString().split("T")[0];

      // Пропускаем если на неделе уже есть слоты
      const existing = await prisma.scheduleSlot.count({
        where: { weekStartDate: targetWeek },
      });

      if (existing > 0) {
        skippedWeeks.push(targetWeek);
        continue;
      }

      const result = await prisma.scheduleSlot.createMany({
        data: sourceSlots.map((slot) => ({
          teacherId: slot.teacherId,
          studentId: slot.studentId,
          groupId: slot.groupId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          weekStartDate: targetWeek,
          lessonType: slot.lessonType,
          lessonCategory: slot.lessonCategory,
          room: slot.room,
        })),
      });

      totalCreated += result.count;
    }

    await logAudit({
      entityType: "ScheduleSlot",
      entityId: fromWeek,
      action: "CREATE",
      changes: { action: { old: null, new: "extend" }, weeks: { old: null, new: weeks }, created: { old: null, new: totalCreated } },
    });

    return NextResponse.json({
      message: `Создано ${totalCreated} слотов на ${weeks - skippedWeeks.length} недель`,
      totalCreated,
      skippedWeeks,
    });
  } catch (error) {
    console.error("Ошибка при продлении расписания:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
