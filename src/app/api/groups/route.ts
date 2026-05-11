import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { buildGroupDisplayName, validateGroupComposition } from "@/lib/group-utils";

export async function GET() {
  try {
    const groups = await prisma.group.findMany({
      include: {
        teacher: true,
        members: { include: { student: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const enriched = groups.map((g) => ({
      ...g,
      displayName: buildGroupDisplayName(g),
    }));

    return NextResponse.json(enriched);
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
    const { name, teacherId, studentIds, groupType } = body as {
      name?: string;
      teacherId?: string;
      studentIds?: string[];
      groupType?: string;
    };

    const type = (groupType ?? "GROUP").toUpperCase();
    const ids = Array.isArray(studentIds) ? studentIds : [];

    if (!teacherId) {
      return NextResponse.json({ error: "Учитель обязателен" }, { status: 400 });
    }

    const compositionError = validateGroupComposition(type, ids.length, name);
    if (compositionError) {
      return NextResponse.json({ error: compositionError }, { status: 400 });
    }

    const group = await prisma.group.create({
      data: {
        name: name?.trim() || null,
        groupType: type,
        teacherId,
        members:
          ids.length > 0
            ? { createMany: { data: ids.map((studentId) => ({ studentId })) } }
            : undefined,
      },
      include: {
        teacher: true,
        members: { include: { student: true } },
      },
    });

    await logAudit({ entityType: "Group", entityId: group.id, action: "CREATE" });

    return NextResponse.json(
      { ...group, displayName: buildGroupDisplayName(group) },
      { status: 201 },
    );
  } catch (error) {
    console.error("Ошибка при создании группы:", error);
    return NextResponse.json(
      { error: "Не удалось создать группу" },
      { status: 500 }
    );
  }
}
