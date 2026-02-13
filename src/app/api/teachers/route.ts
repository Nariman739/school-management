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

    const { lastName, firstName, patronymic, phone, individualRate, groupRate } =
      body;

    if (!lastName || !firstName) {
      return NextResponse.json(
        { error: "Фамилия и имя обязательны для заполнения" },
        { status: 400 }
      );
    }

    const teacher = await prisma.teacher.create({
      data: {
        lastName,
        firstName,
        patronymic: patronymic || null,
        phone: phone || null,
        individualRate: individualRate ? parseInt(String(individualRate), 10) : 0,
        groupRate: groupRate ? parseInt(String(groupRate), 10) : 0,
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
