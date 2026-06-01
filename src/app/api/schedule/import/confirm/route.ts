import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEndTime, DAY_GROUPS } from "@/lib/schedule-utils";
import { freezePriceForSlot, getDefaultServiceTypeForSlot } from "@/lib/pricing";

interface SlotToCreate {
  teacherId: string;
  studentId?: string | null;
  groupId?: string | null;
  pairStudentIds?: string[]; // когда импорт распознал пару из ячейки "X+Y"
  startTime: string;
  dayGroup: "mwf" | "tt" | "sat";
  lessonType: string; // "INDIVIDUAL" | "PAIR" | "GROUP"
  lessonCategory?: string | null;
  room?: string | null;
  serviceTypeId?: string | null;
}

// Ищет существующую PAIR-группу с ровно этими 2 members + этим учителем, либо создаёт новую
async function getOrCreatePairGroup(
  teacherId: string,
  studentIds: string[],
): Promise<string | null> {
  if (studentIds.length !== 2) return null;
  const [a, b] = studentIds;

  const candidates = await prisma.group.findMany({
    where: { teacherId, groupType: "PAIR" },
    include: { members: true },
  });

  for (const g of candidates) {
    const ids = g.members.map((m) => m.studentId).sort();
    const want = [a, b].sort();
    if (ids.length === 2 && ids[0] === want[0] && ids[1] === want[1]) {
      return g.id;
    }
  }

  const created = await prisma.group.create({
    data: {
      teacherId,
      groupType: "PAIR",
      name: null,
      members: { createMany: { data: studentIds.map((studentId) => ({ studentId })) } },
    },
  });
  return created.id;
}

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

      // Разрешаем groupId: либо явный, либо собираем пару из pairStudentIds
      let resolvedGroupId: string | null = slot.groupId ?? null;
      let lessonType = slot.lessonType ?? "INDIVIDUAL";

      if (!resolvedGroupId && slot.pairStudentIds && slot.pairStudentIds.length === 2) {
        resolvedGroupId = await getOrCreatePairGroup(slot.teacherId, slot.pairStudentIds);
        lessonType = "GROUP"; // в БД пара хранится как Group(groupType=PAIR), lessonType все равно GROUP
      }

      // Резолвим serviceTypeId
      let serviceTypeId: string | null = slot.serviceTypeId ?? null;
      if (!serviceTypeId) {
        let groupType: string | null = null;
        if (resolvedGroupId) {
          const g = await prisma.group.findUnique({
            where: { id: resolvedGroupId },
            select: { groupType: true },
          });
          groupType = g?.groupType ?? null;
        }
        const def = await getDefaultServiceTypeForSlot({ lessonType, groupType });
        serviceTypeId = def?.id ?? null;
      }

      for (const dayOfWeek of days) {
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

        const frozenPrice = await freezePriceForSlot({
          studentId: slot.studentId ?? null,
          groupId: resolvedGroupId,
          serviceTypeId,
        });

        await prisma.scheduleSlot.create({
          data: {
            teacherId: slot.teacherId,
            studentId: slot.studentId ?? null,
            groupId: resolvedGroupId,
            serviceTypeId,
            frozenPrice,
            dayOfWeek,
            startTime: slot.startTime,
            endTime: getEndTime(slot.startTime),
            weekStartDate: weekStart,
            lessonType,
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
