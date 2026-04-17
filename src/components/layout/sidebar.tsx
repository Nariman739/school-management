"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type NavItem = {
  name: string;
  href: string;
  icon: string;
  roles?: string[]; // если не указано — видят все
};

const navigation: NavItem[] = [
  { name: "Главная", href: "/", icon: "🏠" },
  { name: "Учителя", href: "/teachers", icon: "👨‍🏫" },
  { name: "Ученики", href: "/students", icon: "👨‍🎓" },
  { name: "Группы", href: "/groups", icon: "👥" },
  { name: "Расписание", href: "/schedule", icon: "📅" },
  { name: "Посещаемость", href: "/attendance", icon: "✅" },
  { name: "Оплата", href: "/payments", icon: "💳", roles: ["ADMIN", "DIRECTOR"] },
  { name: "Зарплата", href: "/reports/salary", icon: "💰" },
  { name: "Счёт родителям", href: "/reports/billing", icon: "🧾", roles: ["ADMIN", "DIRECTOR"] },
  { name: "Пользователи", href: "/admin/users", icon: "🔑", roles: ["ADMIN"] },
];

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Администратор",
  DIRECTOR: "Руководитель",
  TEACHER: "Педагог",
};

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role || "ADMIN";

  const visibleNav = navigation.filter(
    (item) => !item.roles || item.roles.includes(userRole)
  );

  return (
    <aside className="flex w-64 flex-col border-r bg-white">
      <div className="border-b p-4">
        <h1 className="text-lg font-bold">School Manager</h1>
        <p className="text-sm text-muted-foreground">Управление центром</p>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {visibleNav.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <span>{item.icon}</span>
              {item.name}
            </Link>
          );
        })}
      </nav>
      {session?.user && (
        <div className="border-t p-4">
          <div className="mb-2 text-sm">
            <div className="font-medium">{session.user.name}</div>
            <div className="text-xs text-gray-500">
              {ROLE_LABELS[userRole] || userRole}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Выйти
          </Button>
        </div>
      )}
    </aside>
  );
}
