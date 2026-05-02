// Запуск: npx tsx scripts/check-may-data.ts

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import * as dotenv from "dotenv";
dotenv.config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const att = await prisma.attendance.findMany({ where: { date: { startsWith: "2026-05" } } });
  const apr = await prisma.attendance.findMany({ where: { date: { startsWith: "2026-04" } } });
  const pay = await prisma.payment.findMany({ where: { date: { startsWith: "2026-05" } } });
  const payApr = await prisma.payment.findMany({ where: { date: { startsWith: "2026-04" } } });

  console.log(`Attendance май 2026: ${att.length}`);
  console.log(`Attendance апр 2026: ${apr.length}`);
  console.log(`Payment май 2026: ${pay.length}`);
  console.log(`Payment апр 2026: ${payApr.length}`);

  const weeks = await prisma.scheduleSlot.findMany({
    select: { weekStartDate: true },
    distinct: ["weekStartDate"],
    orderBy: { weekStartDate: "asc" },
  });
  console.log("\nНедели со слотами в расписании:");
  for (const w of weeks) console.log("  ", w.weekStartDate);

  const today = new Date().toISOString().split("T")[0];
  console.log(`\nСегодня: ${today}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
