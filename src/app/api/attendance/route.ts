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

    // Определяем понедельник недели для этой даты
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    const weekStart = d.toISOString().split("T")[0];

    // День недели: 1=Пн ... 7=Вс
    const dateObj = new Date(date);
    const jsDay = dateObj.getDay(); // 0=Вс, 1=Пн ...
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;

    const slotWhere: Record<string, unknown> = {
      weekStartDate: weekStart,
      dayOfWeek,
    };

    if (teacherId) {
      slotWhere.teacherId = teacherId;
    }

    // Получаем слоты расписания на этот день
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
        },
      },
      orderBy: [{ startTime: "asc" }],
    });

    // Формируем данные для посещаемости
    const attendanceData = scheduleSlots.map((slot) => {
      // Собираем всех учеников этого слота
      const slotStudents: { studentId: string; studentName: string; isPresent: boolean; attendanceId: string | null }[] = [];

      if (slot.lessonType === "INDIVIDUAL" && slot.student) {
        const att = slot.attendances.find((a) => a.studentId === slot.student!.id);
        slotStudents.push({
          studentId: slot.student.id,
          studentName: `${slot.student.lastName} ${slot.student.firstName}`,
          isPresent: att?.isPresent ?? false,
          attendanceId: att?.id ?? null,
        });
      } else if (slot.lessonType === "GROUP" && slot.group) {
        for (const member of slot.group.members) {
          const att = slot.attendances.find((a) => a.studentId === member.student.id);
          slotStudents.push({
            studentId: member.student.id,
            studentName: `${member.student.lastName} ${member.student.firstName}`,
            isPresent: att?.isPresent ?? false,
            attendanceId: att?.id ?? null,
          });
        }
      }

      return {
        slotId: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        teacherName: `${slot.teacher.lastName} ${slot.teacher.firstName}`,
        teacherId: slot.teacher.id,
        lessonType: slot.lessonType,
        groupName: slot.group?.name || null,
        students: slotStudents,
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
    const { scheduleSlotId, studentId, date, isPresent } = body;

    if (!scheduleSlotId || !studentId || !date) {
      return NextResponse.json(
        { error: "scheduleSlotId, studentId и date обязательны" },
        { status: 400 }
      );
    }

    // Upsert — создаём или обновляем запись
    const attendance = await prisma.attendance.upsert({
      where: {
        scheduleSlotId_studentId_date: {
          scheduleSlotId,
          studentId,
          date,
        },
      },
      update: {
        isPresent,
        markedAt: new Date(),
      },
      create: {
        scheduleSlotId,
        studentId,
        date,
        isPresent,
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
