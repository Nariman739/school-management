import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// GET /api/methodist?date=2025-01-20 — отметки методистов за дату
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");

    if (!date) {
      return NextResponse.json({ error: "date обязателен" }, { status: 400 });
    }

    // Все активные методисты
    const methodists = await prisma.teacher.findMany({
      where: { isMethodist: true, isActive: true },
      orderBy: [{ lastName: "asc" }],
    });

    // Их отметки на эту дату
    const checks = await prisma.methodistCheck.findMany({
      where: { date },
    });

    const checksMap = new Map(checks.map((c) => [c.teacherId, c]));

    const result = methodists.map((t) => {
      const check = checksMap.get(t.id);
      return {
        teacherId: t.id,
        teacherName: `${t.lastName} ${t.firstName}`,
        weeklyRate: t.methodistWeeklyRate,
        completed: check?.completed ?? null, // null = не отмечено, true/false = отмечено
        checkId: check?.id ?? null,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Ошибка при получении методистов:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// POST /api/methodist — отметить метод. час
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { teacherId, date, completed } = body;

    if (!teacherId || !date || completed === undefined) {
      return NextResponse.json(
        { error: "teacherId, date и completed обязательны" },
        { status: 400 }
      );
    }

    const check = await prisma.methodistCheck.upsert({
      where: { teacherId_date: { teacherId, date } },
      update: { completed },
      create: { teacherId, date, completed },
    });

    await logAudit({ entityType: "MethodistCheck", entityId: check.id, action: "UPDATE", changes: { completed: { old: null, new: completed } } });

    return NextResponse.json(check);
  } catch (error) {
    console.error("Ошибка при отметке метод. часа:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
