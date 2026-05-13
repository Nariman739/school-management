// Запуск: npx tsx scripts/check-methodist-state.ts
// Проверяет что в БД нет MethodistCheck на выходные

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import * as dotenv from "dotenv";

dotenv.config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const all = await prisma.methodistCheck.findMany({
    orderBy: { date: "asc" },
    include: { teacher: { select: { lastName: true, firstName: true } } },
  });

  console.log(`Всего MethodistCheck в БД: ${all.length}\n`);

  const byDay: Record<string, number> = {};
  for (const c of all) {
    const day = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][new Date(`${c.date}T00:00:00`).getDay()];
    byDay[day] = (byDay[day] || 0) + 1;
  }
  console.log("По дням недели:", byDay);
  const weekendCount = (byDay.Сб || 0) + (byDay.Вс || 0);
  console.log(weekendCount === 0 ? "✓ Выходных записей нет" : `✗ Выходных записей: ${weekendCount}`);

  const week = all.filter((c) => c.date >= "2026-04-27" && c.date <= "2026-05-03");
  console.log(`\nЗа неделю 27.04 — 03.05: ${week.length} записей`);
  for (const c of week) {
    const day = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][new Date(`${c.date}T00:00:00`).getDay()];
    console.log(`  ${c.date} (${day}) — ${c.teacher.lastName} — completed=${c.completed}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
