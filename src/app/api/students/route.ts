import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/students — list all active students
export async function GET() {
  try {
    const students = await prisma.student.findMany({
      where: { isActive: true },
      orderBy: { lastName: "asc" },
    });
    return NextResponse.json(students);
  } catch (error) {
    console.error("Failed to fetch students:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить список учеников" },
      { status: 500 }
    );
  }
}

// POST /api/students — create a new student
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { lastName, firstName, patronymic, parentName, parentPhone, hourlyRate } = body;

    if (!lastName || !firstName) {
      return NextResponse.json(
        { error: "Фамилия и имя обязательны для заполнения" },
        { status: 400 }
      );
    }

    const student = await prisma.student.create({
      data: {
        lastName,
        firstName,
        patronymic: patronymic || null,
        parentName: parentName || null,
        parentPhone: parentPhone || null,
        hourlyRate: hourlyRate ? parseInt(String(hourlyRate), 10) : 0,
      },
    });

    return NextResponse.json(student, { status: 201 });
  } catch (error) {
    console.error("Failed to create student:", error);
    return NextResponse.json(
      { error: "Не удалось создать ученика" },
      { status: 500 }
    );
  }
}
