import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireRole, isUser } from "@/lib/auth-utils";

const ALLOWED_KIND = ["INDIVIDUAL", "PAIR", "GROUP"] as const;

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireRole("ADMIN", "DIRECTOR");
    if (!isUser(auth)) return auth;

    const { id } = await params;
    const body = await request.json();
    const { name, kind, sortOrder, isActive } = body;

    if (kind && !ALLOWED_KIND.includes(kind)) {
      return NextResponse.json(
        { error: `Поле kind должно быть одним из: ${ALLOWED_KIND.join(", ")}` },
        { status: 400 },
      );
    }

    const existing = await prisma.serviceType.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Тип услуги не найден" }, { status: 404 });
    }

    const updated = await prisma.serviceType.update({
      where: { id },
      data: {
        name: name !== undefined ? String(name).trim() : existing.name,
        kind: kind ?? existing.kind,
        sortOrder: typeof sortOrder === "number" ? sortOrder : existing.sortOrder,
        isActive: typeof isActive === "boolean" ? isActive : existing.isActive,
      },
    });

    await logAudit({ entityType: "ServiceType", entityId: id, action: "UPDATE", userId: auth.id });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update service:", error);
    return NextResponse.json({ error: "Не удалось обновить тип услуги" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireRole("ADMIN", "DIRECTOR");
    if (!isUser(auth)) return auth;

    const { id } = await params;

    const existing = await prisma.serviceType.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Тип услуги не найден" }, { status: 404 });
    }

    // Soft delete: используется в StudentServicePrice/ScheduleSlot, hard delete заблокирован FK Restrict
    const updated = await prisma.serviceType.update({
      where: { id },
      data: { isActive: false },
    });

    await logAudit({ entityType: "ServiceType", entityId: id, action: "DELETE", userId: auth.id });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to delete service:", error);
    return NextResponse.json({ error: "Не удалось удалить тип услуги" }, { status: 500 });
  }
}
