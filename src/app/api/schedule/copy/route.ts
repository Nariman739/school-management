import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/schedule/copy — скопировать расписание с одной недели на другую
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fromWeek, toWeek } = body;

    if (!fromWeek || !toWeek) {
      return NextResponse.json(
        { error: "Нужно указать fromWeek и toWeek" },
        { status: 400 }
      );
    }

    // Проверяем, что целевая неделя пустая
    const existingSlots = await prisma.scheduleSlot.count({
      where: { weekStartDate: toWeek },
    });

    if (existingSlots > 0) {
      return NextResponse.json(
        { error: "На целевой неделе уже есть расписание. Удалите его перед копированием." },
        { status: 409 }
      );
    }

    // Получаем все слоты с исходной недели
    const sourceSlots = await prisma.scheduleSlot.findMany({
      where: { weekStartDate: fromWeek },
    });

    if (sourceSlots.length === 0) {
      return NextResponse.json(
        { error: "На исходной неделе нет расписания" },
        { status: 404 }
      );
    }

    // Копируем слоты
    const newSlots = await prisma.scheduleSlot.createMany({
      data: sourceSlots.map((slot) => ({
        teacherId: slot.teacherId,
        studentId: slot.studentId,
        groupId: slot.groupId,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        weekStartDate: toWeek,
        lessonType: slot.lessonType,
      })),
    });

    return NextResponse.json(
      { message: `Скопировано ${newSlots.count} слотов`, count: newSlots.count },
      { status: 201 }
    );
  } catch (error) {
    console.error("Ошибка при копировании расписания:", error);
    return NextResponse.json(
      { error: "Не удалось скопировать расписание" },
      { status: 500 }
    );
  }
}
