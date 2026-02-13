import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/schedule?weekStart=2025-01-20&teacherId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get("weekStart");
    const teacherId = searchParams.get("teacherId");
    const dayGroup = searchParams.get("dayGroup");

    if (!weekStart) {
      return NextResponse.json(
        { error: "weekStart обязателен" },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = { weekStartDate: weekStart };
    if (teacherId) {
      where.teacherId = teacherId;
    }
    if (dayGroup === "mwf") {
      where.dayOfWeek = { in: [1, 3, 5] };
    } else if (dayGroup === "tt") {
      where.dayOfWeek = { in: [2, 4] };
    }

    const slots = await prisma.scheduleSlot.findMany({
      where,
      include: {
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            patronymic: true,
            room: true,
          },
        },
        student: true,
        group: {
          include: {
            members: {
              include: { student: true },
            },
          },
        },
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });

    return NextResponse.json(slots);
  } catch (error) {
    console.error("Ошибка при получении расписания:", error);
    return NextResponse.json(
      { error: "Не удалось получить расписание" },
      { status: 500 }
    );
  }
}

// POST /api/schedule — создать слот
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      teacherId,
      studentId,
      groupId,
      dayOfWeek,
      startTime,
      endTime,
      weekStartDate,
      lessonType,
      lessonCategory,
      room,
    } = body;

    if (!teacherId || !dayOfWeek || !startTime || !endTime || !weekStartDate || !lessonType) {
      return NextResponse.json(
        { error: "Все обязательные поля должны быть заполнены" },
        { status: 400 }
      );
    }

    // Валидация: ученик не может быть у двух учителей одновременно
    if (lessonType === "INDIVIDUAL" && studentId) {
      const conflict = await prisma.scheduleSlot.findFirst({
        where: {
          weekStartDate,
          dayOfWeek,
          startTime,
          studentId,
          NOT: { teacherId },
        },
      });

      if (conflict) {
        const conflictTeacher = await prisma.teacher.findUnique({
          where: { id: conflict.teacherId },
        });
        return NextResponse.json(
          {
            error: `Ученик уже записан на это время к ${conflictTeacher?.lastName} ${conflictTeacher?.firstName}`,
          },
          { status: 409 }
        );
      }
    }

    // Валидация: для групповых — проверяем каждого участника группы
    if (lessonType === "GROUP" && groupId) {
      const groupMembers = await prisma.groupMember.findMany({
        where: { groupId },
        include: { student: true },
      });

      for (const member of groupMembers) {
        // Проверяем индивидуальные занятия этого ученика
        const indConflict = await prisma.scheduleSlot.findFirst({
          where: {
            weekStartDate,
            dayOfWeek,
            startTime,
            studentId: member.studentId,
            lessonType: "INDIVIDUAL",
          },
        });

        if (indConflict) {
          return NextResponse.json(
            {
              error: `Ученик ${member.student.lastName} ${member.student.firstName} уже записан на индивидуальное занятие в это время`,
            },
            { status: 409 }
          );
        }

        // Проверяем другие групповые занятия этого ученика
        const groupConflict = await prisma.scheduleSlot.findFirst({
          where: {
            weekStartDate,
            dayOfWeek,
            startTime,
            lessonType: "GROUP",
            group: {
              members: {
                some: { studentId: member.studentId },
              },
            },
            NOT: { groupId },
          },
        });

        if (groupConflict) {
          return NextResponse.json(
            {
              error: `Ученик ${member.student.lastName} ${member.student.firstName} уже в другой группе в это время`,
            },
            { status: 409 }
          );
        }
      }
    }

    // Валидация: учитель не может вести два занятия одновременно
    const teacherConflict = await prisma.scheduleSlot.findFirst({
      where: {
        weekStartDate,
        dayOfWeek,
        startTime,
        teacherId,
      },
    });

    if (teacherConflict) {
      return NextResponse.json(
        { error: "Учитель уже занят в это время" },
        { status: 409 }
      );
    }

    const slot = await prisma.scheduleSlot.create({
      data: {
        teacherId,
        studentId: studentId || null,
        groupId: groupId || null,
        dayOfWeek,
        startTime,
        endTime,
        weekStartDate,
        lessonType,
        lessonCategory: lessonCategory || null,
        room: room || null,
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

    return NextResponse.json(slot, { status: 201 });
  } catch (error) {
    console.error("Ошибка при создании слота расписания:", error);
    return NextResponse.json(
      { error: "Не удалось создать слот расписания" },
      { status: 500 }
    );
  }
}
