import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { lastName, firstName, patronymic, phone, individualRate, groupRate } =
      body;

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

    const teacher = await prisma.teacher.update({
      where: { id },
      data: {
        lastName,
        firstName,
        patronymic: patronymic || null,
        phone: phone || null,
        individualRate: individualRate ? parseInt(String(individualRate), 10) : 0,
        groupRate: groupRate ? parseInt(String(groupRate), 10) : 0,
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
