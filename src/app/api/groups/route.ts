import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const groups = await prisma.group.findMany({
      include: {
        teacher: true,
        members: { include: { student: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(groups);
  } catch (error) {
    console.error("Ошибка при получении списка групп:", error);
    return NextResponse.json(
      { error: "Не удалось получить список групп" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, teacherId, studentIds } = body;

    if (!name || !teacherId) {
      return NextResponse.json(
        { error: "Название группы и учитель обязательны для заполнения" },
        { status: 400 }
      );
    }

    const group = await prisma.group.create({
      data: {
        name,
        teacherId,
        members:
          studentIds && studentIds.length > 0
            ? {
                createMany: {
                  data: studentIds.map((studentId: string) => ({ studentId })),
                },
              }
            : undefined,
      },
      include: {
        teacher: true,
        members: { include: { student: true } },
      },
    });

    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    console.error("Ошибка при создании группы:", error);
    return NextResponse.json(
      { error: "Не удалось создать группу" },
      { status: 500 }
    );
  }
}
