import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { freezePriceForSlot, getDefaultServiceTypeForSlot } from "@/lib/pricing";

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
      lessonCategory,
      room,
      serviceTypeId,
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
    const finalLessonCategory = lessonCategory !== undefined ? lessonCategory : existing.lessonCategory;
    const finalRoom = room !== undefined ? room : existing.room;

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

    // Если поменялся участник или тип занятия — пересчитываем услугу и цену,
    // иначе в слоте осталась бы замороженная цена прежнего ученика.
    const participantChanged =
      finalStudentId !== existing.studentId ||
      finalGroupId !== existing.groupId ||
      finalLessonType !== existing.lessonType;

    let finalServiceTypeId = serviceTypeId !== undefined ? serviceTypeId : existing.serviceTypeId;
    let finalFrozenPrice = existing.frozenPrice;

    if (participantChanged || finalServiceTypeId !== existing.serviceTypeId) {
      if (!finalServiceTypeId) {
        let groupType: string | null = null;
        if (finalGroupId) {
          const g = await prisma.group.findUnique({
            where: { id: finalGroupId },
            select: { groupType: true },
          });
          groupType = g?.groupType ?? null;
        }
        const def = await getDefaultServiceTypeForSlot({ lessonType: finalLessonType, groupType });
        finalServiceTypeId = def?.id ?? null;
      }

      finalFrozenPrice = await freezePriceForSlot({
        studentId: finalStudentId,
        groupId: finalGroupId,
        serviceTypeId: finalServiceTypeId,
      });
    }

    const slot = await prisma.scheduleSlot.update({
      where: { id },
      data: {
        teacherId: finalTeacherId,
        studentId: finalStudentId || null,
        groupId: finalGroupId || null,
        serviceTypeId: finalServiceTypeId,
        frozenPrice: finalFrozenPrice,
        dayOfWeek: finalDayOfWeek,
        startTime: finalStartTime,
        endTime: endTime ?? existing.endTime,
        lessonType: finalLessonType,
        lessonCategory: finalLessonCategory || null,
        room: finalRoom || null,
        // состав занятия относился к прежней группе — сбрасываем
        attendees: finalGroupId !== existing.groupId ? { deleteMany: {} } : undefined,
      },
      include: {
        teacher: true,
        student: true,
        group: {
          include: {
            members: { include: { student: true } },
          },
        },
        serviceType: true,
        attendees: { include: { student: true } },
      },
    });

    await logAudit({ entityType: "ScheduleSlot", entityId: id, action: "UPDATE" });

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
    await logAudit({ entityType: "ScheduleSlot", entityId: id, action: "DELETE" });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Ошибка при удалении слота:", error);
    return NextResponse.json(
      { error: "Не удалось удалить слот" },
      { status: 500 }
    );
  }
}
