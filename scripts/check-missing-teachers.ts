// Сверка ненайденных педагогов из Excel с реальной БД через fuzzy-матч
// Запуск: npx tsx scripts/check-missing-teachers.ts

import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

dotenv.config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const MISSING = [
  "Алена Васильевна",
  "Дарья Александровна Х.",
  "Даяна Сагитовна",
  "Евгения Ивановна",
  "Жанель Женисовна АФК",
  "Инжу Мейрамгалиевна",
  "Тамира Даулетовна",
];

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^а-яёa-z]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

async function main() {
  const teachers = await prisma.teacher.findMany({
    select: { id: true, firstName: true, lastName: true, patronymic: true },
  });
  console.log(`Всего в БД: ${teachers.length} педагогов\n`);

  for (const missing of MISSING) {
    console.log(`\n«${missing}»:`);
    const queryTokens = tokenize(missing);

    const scored = teachers.map((t) => {
      const fullName = [t.lastName, t.firstName, t.patronymic].filter(Boolean).join(" ");
      const tTokens = tokenize(fullName);

      // Для каждого токена из запроса — найти лучшее совпадение в БД
      let totalDistance = 0;
      let unmatchedTokens = 0;
      for (const qt of queryTokens) {
        const best = Math.min(...tTokens.map((bt) => levenshtein(qt, bt)));
        totalDistance += best;
        if (best > qt.length / 2) unmatchedTokens++;
      }

      return { fullName, totalDistance, unmatchedTokens, teacher: t };
    });

    scored.sort((a, b) => a.totalDistance - b.totalDistance);
    const top3 = scored.slice(0, 3);
    for (const s of top3) {
      console.log(`  dist=${s.totalDistance} unmatched=${s.unmatchedTokens} → ${s.fullName}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
