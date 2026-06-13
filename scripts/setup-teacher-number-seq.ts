// Создаёт sequence teacher_number_seq в Neon и проставляет teacherNumber
// для существующих педагогов по алфавиту (для совместимости с фидбеком Дархана 12.06).
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

dotenv.config();
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // 1. Создаём sequence если ещё нет
  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS teacher_number_seq START WITH 1 INCREMENT BY 1;`,
  );
  console.log("✓ sequence teacher_number_seq готов");

  // 2. Текущее значение sequence синхронизируем с MAX(teacherNumber)
  const maxRows = await prisma.$queryRawUnsafe<{ max: number | null }[]>(
    `SELECT COALESCE(MAX("teacherNumber"), 0) AS max FROM "Teacher";`,
  );
  const maxNum = Number(maxRows[0]?.max ?? 0);
  await prisma.$executeRawUnsafe(
    `SELECT setval('teacher_number_seq', GREATEST($1, 1), true);`,
    maxNum + 1,
  );
  console.log(`✓ sequence sync на ${maxNum + 1}`);

  // 3. Проставим teacherNumber всем кто без номера — по фамилии алфавит
  const teachers = await prisma.teacher.findMany({
    where: { teacherNumber: null },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, lastName: true, firstName: true },
  });
  console.log(`Нумерую ${teachers.length} педагогов без номера...`);

  for (const t of teachers) {
    const next = await prisma.$queryRawUnsafe<{ nextval: bigint }[]>(
      `SELECT nextval('teacher_number_seq') AS nextval;`,
    );
    const num = Number(next[0].nextval);
    await prisma.teacher.update({
      where: { id: t.id },
      data: { teacherNumber: num },
    });
    console.log(`  #${num.toString().padStart(3, "0")} — ${t.lastName} ${t.firstName}`);
  }

  console.log("\n✓ Готово");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
