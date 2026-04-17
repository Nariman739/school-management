import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export type UserRole = "ADMIN" | "DIRECTOR" | "TEACHER";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  teacherId: string | null;
};

// Получить текущего пользователя из сессии
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user) return null;

  const user = session.user as { id?: string; email?: string; name?: string; role?: string; teacherId?: string | null };
  return {
    id: user.id || "",
    email: user.email || "",
    name: user.name || "",
    role: (user.role as UserRole) || "ADMIN",
    teacherId: user.teacherId || null,
  };
}

// Проверить роль — вернуть юзера или 401/403 Response
export async function requireRole(
  ...allowedRoles: UserRole[]
): Promise<SessionUser | NextResponse> {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  return user;
}

// Хелпер для проверки — вернул ли requireRole юзера или ответ с ошибкой
export function isUser(result: SessionUser | NextResponse): result is SessionUser {
  return !(result instanceof NextResponse);
}
