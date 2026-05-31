import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMonday } from "@/lib/schedule-utils";

// GET /api/students/[id]/schedule?weekStart=YYYY-MM-DD
// Возвращает все слоты ученика на конкретную неделю:
//   1) индивидуальные (studentId = ourId)
//   2) групповые (groupId — где ученик член группы)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get("weekStart") || getMonday(new Date());

    // Группы, в которых состоит ученик (для legacy-слотов без явного SlotAttendee)
    const memberships = await prisma.groupMember.findMany({
      where: { studentId: id },
      select: { groupId: true },
    });
    const groupIds = memberships.map((m) => m.groupId);

    const slots = await prisma.scheduleSlot.findMany({
      where: {
        weekStartDate: weekStart,
        OR: [
          // Индивидуальные слоты
          { studentId: id },
          // Групповые слоты где ученик явно отмечен (динамический состав)
          { attendees: { some: { studentId: id } } },
          // Групповые legacy-слоты без attendees → fallback на GroupMember
          ...(groupIds.length > 0
            ? [
                {
                  groupId: { in: groupIds },
                  attendees: { none: {} },
                },
              ]
            : []),
        ],
      },
      include: {
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            patronymic: true,
          },
        },
        group: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });

    const result = slots.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      lessonType: s.lessonType,
      lessonCategory: s.lessonCategory,
      room: s.room,
      isCancelled: s.isCancelled,
      teacher: {
        id: s.teacher.id,
        fullName: `${s.teacher.lastName} ${s.teacher.firstName}${
          s.teacher.patronymic ? ` ${s.teacher.patronymic}` : ""
        }`,
      },
      group: s.group ? { id: s.group.id, name: s.group.name } : null,
    }));

    return NextResponse.json({ weekStart, slots: result });
  } catch (error) {
    console.error("Ошибка при получении расписания ученика:", error);
    return NextResponse.json(
      { error: "Не удалось получить расписание" },
      { status: 500 }
    );
  }
}
