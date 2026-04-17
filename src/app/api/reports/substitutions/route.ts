import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/reports/substitutions?from=2025-01-20&to=2025-01-26
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json({ error: "from и to обязательны" }, { status: 400 });
    }

    const attendances = await prisma.attendance.findMany({
      where: {
        isSubstitution: true,
        date: { gte: from, lte: to },
      },
      include: {
        scheduleSlot: {
          include: {
            teacher: true,
            student: true,
            group: true,
          },
        },
        student: true,
        substituteTeacher: true,
      },
      orderBy: { date: "desc" },
    });

    // Группируем по слоту+дате (один урок = одна замена)
    const seen = new Map<string, boolean>();
    const result = [];

    for (const att of attendances) {
      const key = `${att.scheduleSlotId}_${att.date}`;
      if (seen.has(key)) continue;
      seen.set(key, true);

      const slot = att.scheduleSlot;
      const originalTeacher = slot.teacher;
      const subTeacher = att.substituteTeacher;

      result.push({
        id: key,
        date: att.date,
        time: slot.startTime,
        originalTeacher: `${originalTeacher.lastName} ${originalTeacher.firstName}`,
        substituteTeacher: subTeacher ? `${subTeacher.lastName} ${subTeacher.firstName}` : "—",
        lessonType: slot.lessonType,
        description: slot.lessonType === "INDIVIDUAL" && slot.student
          ? `${slot.student.lastName} ${slot.student.firstName}`
          : slot.group ? `гр. ${slot.group.name}` : "—",
        lessonCategory: slot.lessonCategory,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Ошибка при получении замен:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
