// Подготовка БД к prisma db push: заполняет NULL значения в полях,
// которые в новой схеме станут required (groupType).
// Запуск: npx tsx scripts/pre-push-fill-defaults.ts
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import * as dotenv from "dotenv";

dotenv.config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Pre-push defaults...");

  // Сейчас Group.groupType nullable; делаем не-null значением "GROUP" по умолчанию.
  // Миграционный скрипт потом переклассифицирует по числу members.
  const updated = await prisma.$executeRawUnsafe(
    `UPDATE "Group" SET "groupType" = 'GROUP' WHERE "groupType" IS NULL;`,
  );
  console.log(`✓ Group.groupType filled for ${updated} rows`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
