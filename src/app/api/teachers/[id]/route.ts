import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const {
      lastName,
      firstName,
      patronymic,
      phone,
      individualRate,
      groupRate,
      groupRate3,
      groupRate5,
      assistantRate,
      accompanimentRate,
      pairRate,
      saturdayRate,
      morningBonusRate,
      eveningBonusRate,
      behavioralBonus,
      room,
      specialization,
      isMethodist,
      methodistWeeklyRate,
    } = body;

    if (!lastName || !firstName) {
      return NextResponse.json(
        { error: "Фамилия и имя обязательны для заполнения" },
        { status: 400 }
      );
    }

    const existing = await prisma.teacher.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json(
        { error: "Учитель не найден" },
        { status: 404 }
      );
    }

    const parseRate = (v: unknown) => (v ? parseInt(String(v), 10) : 0);

    const teacher = await prisma.teacher.update({
      where: { id },
      data: {
        lastName,
        firstName,
        patronymic: patronymic || null,
        phone: phone || null,
        individualRate: parseRate(individualRate),
        groupRate: parseRate(groupRate),
        groupRate3: parseRate(groupRate3),
        groupRate5: parseRate(groupRate5),
        assistantRate: parseRate(assistantRate),
        accompanimentRate: parseRate(accompanimentRate),
        pairRate: parseRate(pairRate),
        saturdayRate: parseRate(saturdayRate),
        morningBonusRate: parseRate(morningBonusRate),
        eveningBonusRate: parseRate(eveningBonusRate),
        behavioralBonus: parseRate(behavioralBonus),
        room: room || null,
        specialization: specialization || null,
        isMethodist: Boolean(isMethodist),
        methodistWeeklyRate: parseRate(methodistWeeklyRate),
        methodistDailyRate: methodistWeeklyRate ? Math.round(parseRate(methodistWeeklyRate) / 5) : 0,
      },
    });

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Ошибка при удалении учителя:", error);
    return NextResponse.json(
      { error: "Не удалось удалить учителя" },
      { status: 500 }
    );
  }
}
