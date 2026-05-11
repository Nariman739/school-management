// Фикс ошибки миграции: я слепо ставил groupType=PAIR всем группам с 2 members.
// На самом деле PAIR — это только группы БЕЗ имени.
// Если у группы есть name, она остаётся GROUP даже если в ней 2 ученика.
// Запуск: npx tsx scripts/fix-pair-classification.ts
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import * as dotenv from "dotenv";

dotenv.config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== Fix pair classification ===");

  const pairs = await prisma.group.findMany({
    where: { groupType: "PAIR" },
    include: { members: true },
  });

  let fixed = 0;
  for (const g of pairs) {
    const hasName = !!(g.name && g.name.trim().length > 0);
    if (hasName) {
      console.log(`  [→GROUP] "${g.name}" (${g.members.length} members)`);
      await prisma.group.update({
        where: { id: g.id },
        data: { groupType: "GROUP" },
      });
      fixed++;
    } else {
      console.log(`  [keep PAIR] ${g.members.length} members, no name`);
    }
  }

  console.log(`\n✓ Перенесено в GROUP: ${fixed} (имели name)`);

  const after = await prisma.group.groupBy({
    by: ["groupType"],
    _count: true,
  });
  console.log("\nИтоговое распределение:");
  for (const r of after) console.log(`  ${r.groupType}: ${r._count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
