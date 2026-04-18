import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/notifications — список уведомлений
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unread") === "true";

    const notifications = await prisma.notification.findMany({
      where: unreadOnly ? { isRead: false } : {},
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(notifications);
  } catch (error) {
    console.error("Ошибка при получении уведомлений:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// PATCH /api/notifications?id=xxx — прочитать уведомление
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id === "all") {
      await prisma.notification.updateMany({
        where: { isRead: false },
        data: { isRead: true },
      });
      return NextResponse.json({ success: true });
    }

    if (!id) {
      return NextResponse.json({ error: "id обязателен" }, { status: 400 });
    }

    await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Ошибка:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// POST /api/notifications — проверить триггеры и создать уведомления
export async function POST() {
  try {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const created: string[] = [];

    // 1. Долги > 7 дней — ученики без оплаты за текущий месяц с начислениями
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthStart = `${currentMonth}-01`;

    const studentsWithAttendance = await prisma.attendance.findMany({
      where: {
        date: { gte: monthStart },
        status: { in: ["ATTENDED", "ABSENT_NO_REASON", "MAKEUP"] },
      },
      select: { studentId: true },
      distinct: ["studentId"],
    });

    const studentsWithPayments = await prisma.payment.findMany({
      where: { date: { gte: monthStart } },
      select: { studentId: true },
      distinct: ["studentId"],
    });

    const paidIds = new Set(studentsWithPayments.map((p) => p.studentId));
    const unpaidStudentIds = studentsWithAttendance
      .map((a) => a.studentId)
      .filter((id) => !paidIds.has(id));

    if (unpaidStudentIds.length > 0 && now.getDate() > 7) {
      const students = await prisma.student.findMany({
        where: { id: { in: unpaidStudentIds }, isActive: true },
      });

      for (const s of students) {
        const exists = await prisma.notification.findFirst({
          where: { entityId: s.id, type: "DEBT_OVERDUE", createdAt: { gte: new Date(monthStart) } },
        });
        if (!exists) {
          await prisma.notification.create({
            data: {
              type: "DEBT_OVERDUE",
              entityType: "Student",
              entityId: s.id,
              title: `Долг: ${s.lastName} ${s.firstName}`,
              message: `Нет оплаты за ${currentMonth}. Занятия проводятся.`,
            },
          });
          created.push(`DEBT: ${s.lastName}`);
        }
      }
    }

    // 2. 3+ пропуска подряд
    const lastWeek = new Date(now);
    lastWeek.setDate(lastWeek.getDate() - 14);
    const twoWeeksAgo = lastWeek.toISOString().split("T")[0];

    const recentAtt = await prisma.attendance.findMany({
      where: { date: { gte: twoWeeksAgo } },
      select: { studentId: true, date: true, status: true },
      orderBy: { date: "asc" },
    });

    const streaks = new Map<string, number>();
    for (const att of recentAtt) {
      const current = streaks.get(att.studentId) || 0;
      if (["ABSENT_NO_REASON", "ABSENT", "ABSENT_VALID_REASON", "SICK"].includes(att.status)) {
        streaks.set(att.studentId, current + 1);
      } else {
        streaks.set(att.studentId, 0);
      }
    }

    for (const [studentId, streak] of streaks) {
      if (streak >= 3) {
        const exists = await prisma.notification.findFirst({
          where: { entityId: studentId, type: "CONSECUTIVE_ABSENCES", createdAt: { gte: new Date(twoWeeksAgo) } },
        });
        if (!exists) {
          const student = await prisma.student.findUnique({ where: { id: studentId } });
          if (student && student.isActive) {
            await prisma.notification.create({
              data: {
                type: "CONSECUTIVE_ABSENCES",
                entityType: "Student",
                entityId: studentId,
                title: `${streak} пропусков подряд: ${student.lastName} ${student.firstName}`,
                message: `Ребёнок пропустил ${streak} занятий подряд. Риск оттока.`,
              },
            });
            created.push(`ABSENCE: ${student.lastName} (${streak})`);
          }
        }
      }
    }

    return NextResponse.json({
      checked: today,
      created: created.length,
      details: created,
    });
  } catch (error) {
    console.error("Ошибка при проверке уведомлений:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
