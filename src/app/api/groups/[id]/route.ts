import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, teacherId, studentIds } = body;

    if (!name || !teacherId) {
      return NextResponse.json(
        { error: "Название группы и учитель обязательны для заполнения" },
        { status: 400 }
      );
    }

    const existing = await prisma.group.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Группа не найдена" },
        { status: 404 }
      );
    }

    const group = await prisma.$transaction(async (tx) => {
      // Update group name and teacher
      await tx.group.update({
        where: { id },
        data: { name, teacherId },
      });

      // Sync members: delete all existing, then create new
      if (studentIds !== undefined) {
        await tx.groupMember.deleteMany({ where: { groupId: id } });

        if (studentIds.length > 0) {
          await tx.groupMember.createMany({
            data: studentIds.map((studentId: string) => ({
              groupId: id,
              studentId,
            })),
          });
        }
      }

      // Return updated group with relations
      return tx.group.findUnique({
        where: { id },
        include: {
          teacher: true,
          members: { include: { student: true } },
        },
      });
    });

    return NextResponse.json(group);
  } catch (error) {
    console.error("Ошибка при обновлении группы:", error);
    return NextResponse.json(
      { error: "Не удалось обновить группу" },
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

    const existing = await prisma.group.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Группа не найдена" },
        { status: 404 }
      );
    }

    await prisma.group.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Ошибка при удалении группы:", error);
    return NextResponse.json(
      { error: "Не удалось удалить группу" },
      { status: 500 }
    );
  }
}
