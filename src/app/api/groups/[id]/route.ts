import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { buildGroupDisplayName, validateGroupComposition } from "@/lib/group-utils";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, teacherId, studentIds, groupType } = body as {
      name?: string;
      teacherId?: string;
      studentIds?: string[];
      groupType?: string;
    };

    const existing = await prisma.group.findUnique({
      where: { id },
      include: { members: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Группа не найдена" }, { status: 404 });
    }

    const nextType = (groupType ?? existing.groupType ?? "GROUP").toUpperCase();
    const nextIds = Array.isArray(studentIds)
      ? studentIds
      : existing.members.map((m) => m.studentId);
    const nextName = name !== undefined ? name?.trim() || null : existing.name;
    const nextTeacherId = teacherId ?? existing.teacherId;

    const compositionError = validateGroupComposition(nextType, nextIds.length, nextName);
    if (compositionError) {
      return NextResponse.json({ error: compositionError }, { status: 400 });
    }

    const group = await prisma.$transaction(async (tx) => {
      await tx.group.update({
        where: { id },
        data: {
          name: nextName,
          teacherId: nextTeacherId,
          groupType: nextType,
        },
      });

      if (studentIds !== undefined) {
        await tx.groupMember.deleteMany({ where: { groupId: id } });
        if (nextIds.length > 0) {
          await tx.groupMember.createMany({
            data: nextIds.map((studentId) => ({ groupId: id, studentId })),
          });
        }
      }

      return tx.group.findUnique({
        where: { id },
        include: {
          teacher: true,
          members: { include: { student: true } },
        },
      });
    });

    await logAudit({ entityType: "Group", entityId: id, action: "UPDATE" });

    return NextResponse.json({
      ...group,
      displayName: group ? buildGroupDisplayName(group) : null,
    });
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

    await logAudit({ entityType: "Group", entityId: id, action: "DELETE" });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Ошибка при удалении группы:", error);
    return NextResponse.json(
      { error: "Не удалось удалить группу" },
      { status: 500 }
    );
  }
}
