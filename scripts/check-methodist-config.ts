// Запуск: npx tsx scripts/check-methodist-config.ts
// Проверяет что у методистов настроены ставки и расчёт правильный

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { calculateMethodistBonus } from "../src/lib/salary-calc";
import * as dotenv from "dotenv";
dotenv.config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const methodists = await prisma.teacher.findMany({
    where: { isMethodist: true, isActive: true },
    orderBy: { lastName: "asc" },
  });

  console.log(`Активных методистов: ${methodists.length}\n`);
  console.log("Имя".padEnd(35) + "WeeklyRate".padEnd(12) + "DailyRate".padEnd(12) + "Daily(расчёт если 0)");
  console.log("-".repeat(80));

  for (const m of methodists) {
    const calcDaily = m.methodistDailyRate > 0
      ? m.methodistDailyRate
      : Math.round(m.methodistWeeklyRate / 5);
    console.log(
      `${m.lastName} ${m.firstName}`.padEnd(35) +
      `${m.methodistWeeklyRate}`.padEnd(12) +
      `${m.methodistDailyRate}`.padEnd(12) +
      `${calcDaily}`
    );
  }

  console.log("\n=== СИМУЛЯЦИЯ РАСЧЁТА ===");
  const tester = methodists[0];
  if (tester) {
    console.log(`\nТест на: ${tester.lastName} ${tester.firstName} (weekly=${tester.methodistWeeklyRate}, daily=${tester.methodistDailyRate})`);
    const cases = [
      { label: "0 отметок (undefined)", input: undefined },
      { label: "0 completed из 0 total", input: { completed: 0, total: 0 } },
      { label: "1 completed из 1 total", input: { completed: 1, total: 1 } },
      { label: "0 completed из 3 total (все 'не состоялся')", input: { completed: 0, total: 3 } },
      { label: "5 completed (полная неделя)", input: { completed: 5, total: 5 } },
      { label: "10 completed (попытка пере-засчитать)", input: { completed: 10, total: 10 } },
    ];
    for (const c of cases) {
      const r = calculateMethodistBonus(tester, c.input);
      console.log(`  ${c.label.padEnd(50)} → ${r} ₸`);
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
