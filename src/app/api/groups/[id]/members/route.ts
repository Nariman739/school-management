import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { studentId } = body;

    if (!studentId) {
      return NextResponse.json(
        { error: "ID ученика обязателен" },
        { status: 400 }
      );
    }

    const group = await prisma.group.findUnique({ where: { id } });
    if (!group) {
      return NextResponse.json(
        { error: "Группа не найдена" },
        { status: 404 }
      );
    }

    // Check if student is already a member
    const existingMember = await prisma.groupMember.findUnique({
      where: { groupId_studentId: { groupId: id, studentId } },
    });

    if (existingMember) {
      return NextResponse.json(
        { error: "Ученик уже состоит в этой группе" },
        { status: 409 }
      );
    }

    const member = await prisma.groupMember.create({
      data: { groupId: id, studentId },
      include: { student: true },
    });

    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    console.error("Ошибка при добавлении ученика в группу:", error);
    return NextResponse.json(
      { error: "Не удалось добавить ученика в группу" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { studentId } = body;

    if (!studentId) {
      return NextResponse.json(
        { error: "ID ученика обязателен" },
        { status: 400 }
      );
    }

    const member = await prisma.groupMember.findUnique({
      where: { groupId_studentId: { groupId: id, studentId } },
    });

    if (!member) {
      return NextResponse.json(
        { error: "Ученик не найден в этой группе" },
        { status: 404 }
      );
    }

    await prisma.groupMember.delete({
      where: { groupId_studentId: { groupId: id, studentId } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Ошибка при удалении ученика из группы:", error);
    return NextResponse.json(
      { error: "Не удалось удалить ученика из группы" },
      { status: 500 }
    );
  }
}
