import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const teachers = await prisma.teacher.findMany({
      where: { isActive: true },
      orderBy: { lastName: "asc" },
    });

    return NextResponse.json(teachers);
  } catch (error) {
    console.error("Ошибка при получении списка учителей:", error);
    return NextResponse.json(
      { error: "Не удалось получить список учителей" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
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

    const parseRate = (v: unknown) => (v ? parseInt(String(v), 10) : 0);

    const teacher = await prisma.teacher.create({
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

    return NextResponse.json(teacher, { status: 201 });
  } catch (error) {
    console.error("Ошибка при создании учителя:", error);
    return NextResponse.json(
      { error: "Не удалось создать учителя" },
      { status: 500 }
    );
  }
}
