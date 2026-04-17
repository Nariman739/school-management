import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { requireRole, isUser } from "@/lib/auth-utils";
import { logAudit } from "@/lib/audit";

// GET /api/admin/users — список всех юзеров
export async function GET() {
  const result = await requireRole("ADMIN");
  if (!isUser(result)) return result;

  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        teacherId: true,
        isActive: true,
        createdAt: true,
        teacher: {
          select: { lastName: true, firstName: true },
        },
      },
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("Ошибка при получении юзеров:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// POST /api/admin/users — создать юзера
export async function POST(request: NextRequest) {
  const currentUser = await requireRole("ADMIN");
  if (!isUser(currentUser)) return currentUser;

  try {
    const body = await request.json();
    const { email, password, name, role, teacherId } = body;

    if (!email || !password || !name || !role) {
      return NextResponse.json(
        { error: "email, password, name и role обязательны" },
        { status: 400 }
      );
    }

    if (!["ADMIN", "DIRECTOR", "TEACHER"].includes(role)) {
      return NextResponse.json(
        { error: "Роль должна быть ADMIN, DIRECTOR или TEACHER" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Пользователь с таким email уже существует" },
        { status: 409 }
      );
    }

    const passwordHash = await hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role,
        teacherId: teacherId || null,
      },
    });

    await logAudit({
      entityType: "User",
      entityId: user.id,
      action: "CREATE",
      userId: currentUser.id,
      userName: currentUser.name,
    });

    return NextResponse.json(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      { status: 201 }
    );
  } catch (error) {
    console.error("Ошибка при создании юзера:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// DELETE /api/admin/users?id=xxx — деактивировать юзера
export async function DELETE(request: NextRequest) {
  const currentUser = await requireRole("ADMIN");
  if (!isUser(currentUser)) return currentUser;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id обязателен" }, { status: 400 });
    }

    if (id === currentUser.id) {
      return NextResponse.json(
        { error: "Нельзя деактивировать самого себя" },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    await logAudit({
      entityType: "User",
      entityId: id,
      action: "DELETE",
      userId: currentUser.id,
      userName: currentUser.name,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Ошибка при деактивации юзера:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
