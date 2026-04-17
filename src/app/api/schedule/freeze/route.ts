import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// GET /api/schedule/freeze — список заморозок
export async function GET() {
  try {
    const freezes = await prisma.scheduleFreeze.findMany({
      include: {
        student: { select: { lastName: true, firstName: true } },
        teacher: { select: { lastName: true, firstName: true } },
      },
      orderBy: { startDate: "desc" },
    });

    return NextResponse.json(freezes);
  } catch (error) {
    console.error("Ошибка при получении заморозок:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// POST /api/schedule/freeze — создать заморозку
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studentId, teacherId, startDate, endDate, reason } = body;

    if (!startDate || !endDate || !reason) {
      return NextResponse.json(
        { error: "startDate, endDate и reason обязательны" },
        { status: 400 }
      );
    }

    const freeze = await prisma.scheduleFreeze.create({
      data: {
        studentId: studentId || null,
        teacherId: teacherId || null,
        startDate,
        endDate,
        reason,
      },
    });

    // Отменяем слоты в период заморозки
    const where: Record<string, unknown> = {};
    if (studentId) where.studentId = studentId;
    if (teacherId) where.teacherId = teacherId;

    // Находим все недели в диапазоне
    const start = new Date(startDate);
    const end = new Date(endDate);
    let cancelled = 0;

    const current = new Date(start);
    // Сдвигаем на понедельник
    const day = current.getDay();
    current.setDate(current.getDate() - (day === 0 ? 6 : day - 1));

    while (current <= end) {
      const weekStart = current.toISOString().split("T")[0];

      const slots = await prisma.scheduleSlot.findMany({
        where: {
          weekStartDate: weekStart,
          isCancelled: false,
          ...where,
        },
      });

      for (const slot of slots) {
        // Проверяем что конкретная дата этого слота попадает в заморозку
        const slotDate = new Date(weekStart);
        slotDate.setDate(slotDate.getDate() + slot.dayOfWeek - 1);
        const slotDateStr = slotDate.toISOString().split("T")[0];

        if (slotDateStr >= startDate && slotDateStr <= endDate) {
          await prisma.scheduleSlot.update({
            where: { id: slot.id },
            data: { isCancelled: true, cancelReason: `Заморозка: ${reason}` },
          });
          cancelled++;
        }
      }

      current.setDate(current.getDate() + 7);
    }

    await logAudit({
      entityType: "ScheduleFreeze",
      entityId: freeze.id,
      action: "CREATE",
      changes: { startDate: { old: null, new: startDate }, endDate: { old: null, new: endDate }, cancelled: { old: null, new: cancelled } },
    });

    return NextResponse.json({ freeze, cancelled });
  } catch (error) {
    console.error("Ошибка при создании заморозки:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// DELETE /api/schedule/freeze?id=xxx — удалить заморозку
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id обязателен" }, { status: 400 });
    }

    await prisma.scheduleFreeze.delete({ where: { id } });

    await logAudit({ entityType: "ScheduleFreeze", entityId: id, action: "DELETE" });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Ошибка при удалении заморозки:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
