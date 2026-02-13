import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PUT /api/students/[id] — update a student
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { lastName, firstName, patronymic, parentName, parentPhone, hourlyRate } = body;

    if (!lastName || !firstName) {
      return NextResponse.json(
        { error: "Фамилия и имя обязательны для заполнения" },
        { status: 400 }
      );
    }

    const existing = await prisma.student.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Ученик не найден" },
        { status: 404 }
      );
    }

    const student = await prisma.student.update({
      where: { id },
      data: {
        lastName,
        firstName,
        patronymic: patronymic || null,
        parentName: parentName || null,
        parentPhone: parentPhone || null,
        hourlyRate: hourlyRate ? parseInt(String(hourlyRate), 10) : 0,
      },
    });

    return NextResponse.json(student);
  } catch (error) {
    console.error("Failed to update student:", error);
    return NextResponse.json(
      { error: "Не удалось обновить данные ученика" },
      { status: 500 }
    );
  }
}

// DELETE /api/students/[id] — soft delete (set isActive=false)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await prisma.student.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Ученик не найден" },
        { status: 404 }
      );
    }

    await prisma.student.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete student:", error);
    return NextResponse.json(
      { error: "Не удалось удалить ученика" },
      { status: 500 }
    );
  }
}
