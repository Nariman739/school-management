// Запуск: npx tsx scripts/cleanup-weekend-methodist.ts
// Чистит ошибочные отметки методического часа за субботу/воскресенье

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import * as dotenv from "dotenv";

dotenv.config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const all = await prisma.methodistCheck.findMany();
  const weekend = all.filter((c) => {
    const day = new Date(`${c.date}T00:00:00`).getDay();
    return day === 0 || day === 6;
  });

  console.log(`Всего MethodistCheck: ${all.length}, на выходных: ${weekend.length}`);

  if (weekend.length === 0) {
    console.log("✓ Чистить нечего");
    return;
  }

  for (const c of weekend) {
    const dayName = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"][
      new Date(`${c.date}T00:00:00`).getDay()
    ];
    console.log(`  → удаляю: ${c.date} (${dayName}), teacherId=${c.teacherId}, completed=${c.completed}`);
    await prisma.methodistCheck.delete({ where: { id: c.id } });
  }

  console.log(`✓ Удалено: ${weekend.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
