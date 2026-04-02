import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Статусы:
// ATTENDED — урок состоялся (педагог ✅, родитель ✅)
// SICK — больничный (педагог ❌, родитель ❌)
// LATE — опоздание (педагог ❌, родитель ✅)
// ABSENT — не был (педагог ❌, родитель ❌)

// GET /api/attendance?date=2025-01-20&teacherId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const teacherId = searchParams.get("teacherId");

    if (!date) {
      return NextResponse.json({ error: "date обязателен" }, { status: 400 });
    }

    // Определяем понедельник недели для этой даты
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    const weekStart = d.toISOString().split("T")[0];

    // День недели: 1=Пн ... 7=Вс
    const dateObj = new Date(date);
    const jsDay = dateObj.getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;

    const slotWhere: Record<string, unknown> = {
      weekStartDate: weekStart,
      dayOfWeek,
    };

    if (teacherId) {
      slotWhere.teacherId = teacherId;
    }

    const scheduleSlots = await prisma.scheduleSlot.findMany({
      where: slotWhere,
      include: {
        teacher: true,
        student: true,
        group: {
          include: { members: { include: { student: true } } },
        },
        attendances: {
          where: { date },
          include: { substituteTeacher: true },
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

      // Замена
      const firstAtt = slot.attendances[0];
      const substitution = firstAtt?.isSubstitution
        ? {
            substituteTeacherId: firstAtt.substituteTeacherId,
            substituteTeacherName: firstAtt.substituteTeacher
              ? `${firstAtt.substituteTeacher.lastName} ${firstAtt.substituteTeacher.firstName}`
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
      };
    });

    return NextResponse.json(attendanceData);
  } catch (error) {
    console.error("Ошибка при получении посещаемости:", error);
    return NextResponse.json(
      { error: "Не удалось получить данные посещаемости" },
      { status: 500 }
    );
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
      status, // ATTENDED | SICK | LATE | ABSENT
      isSubstitution,
      substituteTeacherId,
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
        scheduleSlotId_studentId_date: {
          scheduleSlotId,
          studentId,
          date,
        },
      },
      update: {
        status,
        isPresent,
        isSubstitution: isSubstitution ?? false,
        substituteTeacherId: isSubstitution ? substituteTeacherId : null,
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
        markedAt: new Date(),
      },
    });

    return NextResponse.json(attendance);
  } catch (error) {
    console.error("Ошибка при отметке посещаемости:", error);
    return NextResponse.json(
      { error: "Не удалось отметить посещаемость" },
      { status: 500 }
    );
  }
}

// PATCH /api/attendance — массовая замена педагога на слоте
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { scheduleSlotId, date, substituteTeacherId } = body;

    if (!scheduleSlotId || !date || !substituteTeacherId) {
      return NextResponse.json(
        { error: "scheduleSlotId, date и substituteTeacherId обязательны" },
        { status: 400 }
      );
    }

    // Обновляем все записи посещаемости этого слота на эту дату
    const updated = await prisma.attendance.updateMany({
      where: { scheduleSlotId, date },
      data: {
        isSubstitution: true,
        substituteTeacherId,
      },
    });

    return NextResponse.json({ updated: updated.count });
  } catch (error) {
    console.error("Ошибка при замене педагога:", error);
    return NextResponse.json(
      { error: "Не удалось обновить замену" },
      { status: 500 }
    );
  }
}
