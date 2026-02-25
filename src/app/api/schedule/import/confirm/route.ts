import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEndTime, DAY_GROUPS } from "@/lib/schedule-utils";

interface SlotToCreate {
  teacherId: string;
  studentId?: string | null;
  groupId?: string | null;
  startTime: string;
  dayGroup: "mwf" | "tt";
  lessonType: string;
  lessonCategory?: string | null;
  room?: string | null;
}

// POST /api/schedule/import/confirm
// Body: { slots: SlotToCreate[], weekStart: string }
// Принимает уже разрешённые слоты (после ручного сопоставления в UI) и создаёт их в БД
export async function POST(request: NextRequest) {
  try {
    const { slots, weekStart } = await request.json();

    if (!slots || !weekStart) {
      return NextResponse.json(
        { error: "slots и weekStart обязательны" },
        { status: 400 }
      );
    }

    let created = 0;
    const errors: string[] = [];

    for (const slot of slots as SlotToCreate[]) {
      if (!slot.teacherId || !slot.startTime || !slot.dayGroup) continue;

      const dg = DAY_GROUPS.find((g) => g.id === slot.dayGroup);
      const days = dg?.days ?? [];

      for (const dayOfWeek of days) {
        // Конфликт учителя
        const teacherConflict = await prisma.scheduleSlot.findFirst({
          where: {
            weekStartDate: weekStart,
            dayOfWeek,
            startTime: slot.startTime,
            teacherId: slot.teacherId,
          },
        });

        if (teacherConflict) {
          errors.push(`Конфликт учителя: ${slot.startTime} день ${dayOfWeek}`);
          continue;
        }

        // Конфликт ученика
        if (slot.studentId) {
          const studentConflict = await prisma.scheduleSlot.findFirst({
            where: {
              weekStartDate: weekStart,
              dayOfWeek,
              startTime: slot.startTime,
              studentId: slot.studentId,
            },
          });

          if (studentConflict) {
            errors.push(`Конфликт ученика: ${slot.startTime} день ${dayOfWeek}`);
            continue;
          }
        }

        await prisma.scheduleSlot.create({
          data: {
            teacherId: slot.teacherId,
            studentId: slot.studentId ?? null,
            groupId: slot.groupId ?? null,
            dayOfWeek,
            startTime: slot.startTime,
            endTime: getEndTime(slot.startTime),
            weekStartDate: weekStart,
            lessonType: slot.lessonType ?? "INDIVIDUAL",
            lessonCategory: slot.lessonCategory ?? null,
            room: slot.room ?? null,
          },
        });
        created++;
      }
    }

    return NextResponse.json({ count: created, errors });
  } catch (error) {
    console.error("Ошибка confirm импорта:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
