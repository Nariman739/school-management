import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// PUT /api/schedule/[id]/attendees
// Body: { studentIds: string[] }
// Полностью заменяет состав участников группового слота. Используется когда состав группы
// на конкретном часе/неделе отличается от шаблона (GroupMember). Если studentIds пуст —
// все участники удаляются, и слот «возвращается» к шаблону группы.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const studentIds = Array.isArray(body?.studentIds) ? (body.studentIds as string[]) : [];

    const slot = await prisma.scheduleSlot.findUnique({
      where: { id },
      select: { id: true, lessonType: true, weekStartDate: true, dayOfWeek: true, startTime: true },
    });
    if (!slot) {
      return NextResponse.json({ error: "Слот не найден" }, { status: 404 });
    }

    if (slot.lessonType !== "GROUP" && slot.lessonType !== "PAIR") {
      return NextResponse.json(
        { error: "Состав можно задавать только для групповых/парных слотов" },
        { status: 400 },
      );
    }

    // Проверка конфликтов: каждый из указанных учеников не должен быть в это же время
    // на индивидуальном или в другом групповом слоте.
    for (const studentId of studentIds) {
      const indConflict = await prisma.scheduleSlot.findFirst({
        where: {
          weekStartDate: slot.weekStartDate,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          studentId,
          lessonType: "INDIVIDUAL",
          NOT: { id: slot.id },
        },
        include: { student: true },
      });
      if (indConflict) {
        return NextResponse.json(
          {
            error: `${indConflict.student!.lastName} ${indConflict.student!.firstName} уже на индивидуальном занятии в это время`,
          },
          { status: 409 },
        );
      }
      const groupConflict = await prisma.scheduleSlot.findFirst({
        where: {
          weekStartDate: slot.weekStartDate,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          lessonType: { in: ["GROUP", "PAIR"] },
          attendees: { some: { studentId } },
          NOT: { id: slot.id },
        },
      });
      if (groupConflict) {
        return NextResponse.json(
          { error: "Один из учеников уже в другой группе в это время" },
          { status: 409 },
        );
      }
    }

    await prisma.$transaction([
      prisma.slotAttendee.deleteMany({ where: { slotId: id } }),
      ...(studentIds.length > 0
        ? [
            prisma.slotAttendee.createMany({
              data: studentIds.map((studentId) => ({ slotId: id, studentId })),
            }),
          ]
        : []),
    ]);

    await logAudit({ entityType: "ScheduleSlot", entityId: id, action: "UPDATE" });

    const refreshed = await prisma.scheduleSlot.findUnique({
      where: { id },
      include: {
        attendees: { include: { student: true } },
      },
    });

    return NextResponse.json(refreshed);
  } catch (error) {
    console.error("Ошибка при обновлении состава слота:", error);
    return NextResponse.json({ error: "Не удалось обновить состав" }, { status: 500 });
  }
}
