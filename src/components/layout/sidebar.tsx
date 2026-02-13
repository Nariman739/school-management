"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Главная", href: "/", icon: "🏠" },
  { name: "Учителя", href: "/teachers", icon: "👨‍🏫" },
  { name: "Ученики", href: "/students", icon: "👨‍🎓" },
  { name: "Группы", href: "/groups", icon: "👥" },
  { name: "Расписание", href: "/schedule", icon: "📅" },
  { name: "Посещаемость", href: "/attendance", icon: "✅" },
  { name: "Зарплата", href: "/reports/salary", icon: "💰" },
  { name: "Счёт родителям", href: "/reports/billing", icon: "🧾" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 flex-col border-r bg-white">
      <div className="border-b p-4">
        <h1 className="text-lg font-bold">School Manager</h1>
        <p className="text-sm text-muted-foreground">Управление центром</p>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navigation.map((item) => {
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
    </aside>
  );
}
