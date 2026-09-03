import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma/client";

const RATE_FIELDS = [
  "individualRate",
  "groupRate",
  "groupRate3",
  "groupRate5",
  "assistantRate",
  "accompanimentRate",
  "pairRate",
  "saturdayRate",
  "morningBonusRate",
  "eveningBonusRate",
  "behavioralBonus",
] as const;

const NULLABLE_TEXT_FIELDS = ["patronymic", "phone", "room", "specialization"] as const;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Частичное обновление: трогаем только те поля, что реально пришли.
    // Иначе форма, шлющая одно ФИО (правка из расписания), обнулила бы все ставки.
    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
    const parseRate = (v: unknown) => (v ? parseInt(String(v), 10) : 0);

    const { lastName, firstName } = body;

    if (has("lastName") && !String(lastName ?? "").trim()) {
      return NextResponse.json({ error: "Фамилия обязательна для заполнения" }, { status: 400 });
    }
    if (has("firstName") && !String(firstName ?? "").trim()) {
      return NextResponse.json({ error: "Имя обязательно для заполнения" }, { status: 400 });
    }

    const existing = await prisma.teacher.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json(
        { error: "Учитель не найден" },
        { status: 404 }
      );
    }

    const data: Prisma.TeacherUpdateInput = {};

    if (has("lastName")) data.lastName = String(lastName).trim();
    if (has("firstName")) data.firstName = String(firstName).trim();

    for (const field of NULLABLE_TEXT_FIELDS) {
      if (has(field)) {
        const raw = body[field];
        const value = raw == null ? "" : String(raw).trim();
        data[field] = value || null;
      }
    }

    for (const field of RATE_FIELDS) {
      if (has(field)) data[field] = parseRate(body[field]);
    }


    if (has("isMethodist")) data.isMethodist = Boolean(body.isMethodist);

    if (has("methodistWeeklyRate")) {
      const weekly = parseRate(body.methodistWeeklyRate);
      data.methodistWeeklyRate = weekly;
      data.methodistDailyRate = weekly ? Math.round(weekly / 5) : 0;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(existing);
    }

    const teacher = await prisma.teacher.update({ where: { id }, data });

    await logAudit({ entityType: "Teacher", entityId: id, action: "UPDATE" });

    return NextResponse.json(teacher);
  } catch (error) {
    console.error("Ошибка при обновлении учителя:", error);
    return NextResponse.json(
      { error: "Не удалось обновить данные учителя" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await prisma.teacher.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json(
        { error: "Учитель не найден" },
        { status: 404 }
      );
    }

    await prisma.teacher.update({
      where: { id },
      data: { isActive: false },
    });

    await logAudit({ entityType: "Teacher", entityId: id, action: "DELETE" });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Ошибка при удалении учителя:", error);
    return NextResponse.json(
      { error: "Не удалось удалить учителя" },
      { status: 500 }
    );
  }
}
