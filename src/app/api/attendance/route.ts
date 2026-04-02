import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/attendance?date=2025-01-20&teacherId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const teacherId = searchParams.get("teacherId");

    if (!date) {
      return NextResponse.json({ error: "date обязателен" }, { status: 400 });
    }

    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    const weekStart = d.toISOString().split("T")[0];

    const dateObj = new Date(date);
    const jsDay = dateObj.getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;

    const slotWhere: Record<string, unknown> = {
      weekStartDate: weekStart,
      dayOfWeek,
    };
    if (teacherId) slotWhere.teacherId = teacherId;

    const scheduleSlots = await prisma.scheduleSlot.findMany({
      where: slotWhere,
      include: {
        teacher: true,
        student: true,
        group: { include: { members: { include: { student: true } } } },
        attendances: {
          where: { date },
          include: { substituteTeacher: true, assistantTeacher: true },
        },
      },
      orderBy: [{ startTime: "asc" }],
    });

    const attendanceData = scheduleSlots.map((slot) => {
      const slotStudents: {
        studentId: string;
        studentName: string;
        status: string;
        isPresent: boolean;
        attendanceId: string | null;
        isBehavioral: boolean;
      }[] = [];

      if (slot.lessonType === "INDIVIDUAL" && slot.student) {
        const att = slot.attendances.find((a) => a.studentId === slot.student!.id);
        slotStudents.push({
          studentId: slot.student.id,
          studentName: `${slot.student.lastName} ${slot.student.firstName}`,
          status: att?.status ?? "ABSENT",
          isPresent: att?.status === "ATTENDED",
          attendanceId: att?.id ?? null,
          isBehavioral: slot.student.isBehavioral,
        });
      } else if (slot.lessonType === "GROUP" && slot.group) {
        for (const member of slot.group.members) {
          const att = slot.attendances.find((a) => a.studentId === member.student.id);
          slotStudents.push({
            studentId: member.student.id,
            studentName: `${member.student.lastName} ${member.student.firstName}`,
            status: att?.status ?? "ABSENT",
            isPresent: att?.status === "ATTENDED",
            attendanceId: att?.id ?? null,
            isBehavioral: member.student.isBehavioral,
          });
        }
      }

      const firstAtt = slot.attendances[0];

      const substitution = firstAtt?.isSubstitution
        ? {
            substituteTeacherId: firstAtt.substituteTeacherId,
            substituteTeacherName: firstAtt.substituteTeacher
              ? `${firstAtt.substituteTeacher.lastName} ${firstAtt.substituteTeacher.firstName}`
              : null,
          }
        : null;

      const assistant = firstAtt?.assistantTeacherId
        ? {
            assistantTeacherId: firstAtt.assistantTeacherId,
            assistantTeacherName: firstAtt.assistantTeacher
              ? `${firstAtt.assistantTeacher.lastName} ${firstAtt.assistantTeacher.firstName}`
              : null,
          }
        : null;

      return {
        slotId: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        teacherName: `${slot.teacher.lastName} ${slot.teacher.firstName}`,
        teacherId: slot.teacher.id,
        lessonType: slot.lessonType,
        lessonCategory: slot.lessonCategory,
        groupName: slot.group?.name || null,
        students: slotStudents,
        substitution,
        assistant,
      };
    });

    return NextResponse.json(attendanceData);
  } catch (error) {
    console.error("Ошибка при получении посещаемости:", error);
    return NextResponse.json({ error: "Не удалось получить данные" }, { status: 500 });
  }
}

// POST /api/attendance — отметить посещаемость
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      scheduleSlotId,
      studentId,
      date,
      status,
      isSubstitution,
      substituteTeacherId,
      assistantTeacherId,
    } = body;

    if (!scheduleSlotId || !studentId || !date || !status) {
      return NextResponse.json(
        { error: "scheduleSlotId, studentId, date и status обязательны" },
        { status: 400 }
      );
    }

    const isPresent = status === "ATTENDED";

    const attendance = await prisma.attendance.upsert({
      where: {
        scheduleSlotId_studentId_date: { scheduleSlotId, studentId, date },
      },
      update: {
        status,
        isPresent,
        isSubstitution: isSubstitution ?? false,
        substituteTeacherId: isSubstitution ? substituteTeacherId : null,
        assistantTeacherId: assistantTeacherId ?? null,
        markedAt: new Date(),
      },
      create: {
        scheduleSlotId,
        studentId,
        date,
        status,
        isPresent,
        isSubstitution: isSubstitution ?? false,
        substituteTeacherId: isSubstitution ? substituteTeacherId : null,
        assistantTeacherId: assistantTeacherId ?? null,
        markedAt: new Date(),
      },
    });

    return NextResponse.json(attendance);
  } catch (error) {
    console.error("Ошибка при отметке посещаемости:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// PATCH /api/attendance — массовое обновление слота (замена/ассистент)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { scheduleSlotId, date, substituteTeacherId, assistantTeacherId, action } = body;

    if (!scheduleSlotId || !date) {
      return NextResponse.json(
        { error: "scheduleSlotId и date обязательны" },
        { status: 400 }
      );
    }

    if (action === "setAssistant" && assistantTeacherId) {
      const updated = await prisma.attendance.updateMany({
        where: { scheduleSlotId, date },
        data: { assistantTeacherId },
      });
      return NextResponse.json({ updated: updated.count });
    }

    if (action === "removeAssistant") {
      const updated = await prisma.attendance.updateMany({
        where: { scheduleSlotId, date },
        data: { assistantTeacherId: null },
      });
      return NextResponse.json({ updated: updated.count });
    }

    // Default: замена педагога
    if (substituteTeacherId) {
      const updated = await prisma.attendance.updateMany({
        where: { scheduleSlotId, date },
        data: { isSubstitution: true, substituteTeacherId },
      });
      return NextResponse.json({ updated: updated.count });
    }

    return NextResponse.json({ error: "Не указано действие" }, { status: 400 });
  } catch (error) {
    console.error("Ошибка:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
