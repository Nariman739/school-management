import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PUT /api/schedule/[id] — обновить слот
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      teacherId,
      studentId,
      groupId,
      dayOfWeek,
      startTime,
      endTime,
      lessonType,
    } = body;

    const existing = await prisma.scheduleSlot.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Слот не найден" },
        { status: 404 }
      );
    }

    const finalTeacherId = teacherId ?? existing.teacherId;
    const finalDayOfWeek = dayOfWeek ?? existing.dayOfWeek;
    const finalStartTime = startTime ?? existing.startTime;
    const finalStudentId = studentId !== undefined ? studentId : existing.studentId;
    const finalGroupId = groupId !== undefined ? groupId : existing.groupId;
    const finalLessonType = lessonType ?? existing.lessonType;

    // Валидация: учитель не занят в это время (кроме текущего слота)
    const teacherConflict = await prisma.scheduleSlot.findFirst({
      where: {
        weekStartDate: existing.weekStartDate,
        dayOfWeek: finalDayOfWeek,
        startTime: finalStartTime,
        teacherId: finalTeacherId,
        NOT: { id },
      },
    });

    if (teacherConflict) {
      return NextResponse.json(
        { error: "Учитель уже занят в это время" },
        { status: 409 }
      );
    }

    // Валидация: ученик не занят в это время
    if (finalLessonType === "INDIVIDUAL" && finalStudentId) {
      const studentConflict = await prisma.scheduleSlot.findFirst({
        where: {
          weekStartDate: existing.weekStartDate,
          dayOfWeek: finalDayOfWeek,
          startTime: finalStartTime,
          studentId: finalStudentId,
          NOT: { id },
        },
      });

      if (studentConflict) {
        return NextResponse.json(
          { error: "Ученик уже записан на это время" },
          { status: 409 }
        );
      }
    }

    const slot = await prisma.scheduleSlot.update({
      where: { id },
      data: {
        teacherId: finalTeacherId,
        studentId: finalStudentId || null,
        groupId: finalGroupId || null,
        dayOfWeek: finalDayOfWeek,
        startTime: finalStartTime,
        endTime: endTime ?? existing.endTime,
        lessonType: finalLessonType,
      },
      include: {
        teacher: true,
        student: true,
        group: {
          include: {
            members: { include: { student: true } },
          },
        },
      },
    });

    return NextResponse.json(slot);
  } catch (error) {
    console.error("Ошибка при обновлении слота:", error);
    return NextResponse.json(
      { error: "Не удалось обновить слот" },
      { status: 500 }
    );
  }
}

// DELETE /api/schedule/[id] — удалить слот
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.scheduleSlot.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Ошибка при удалении слота:", error);
    return NextResponse.json(
      { error: "Не удалось удалить слот" },
      { status: 500 }
    );
  }
}
