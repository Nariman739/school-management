import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
async function main() {
  // Активные без ID
  const noId = await prisma.student.findMany({
    where: { isActive: true, studentNumber: null },
    select: { id: true, lastName: true, firstName: true },
  });
  console.log(`Активных без ID: ${noId.length}`);
  for (const s of noId) console.log(`  ${s.lastName} ${s.firstName}`);

  // Пропуски в нумерации
  const nums = await prisma.student.findMany({ select: { studentNumber: true } });
  const set = new Set(nums.map((n) => n.studentNumber).filter((n): n is number => n !== null));
  const maxRow: any = await prisma.$queryRawUnsafe(`SELECT MAX("studentNumber") as max FROM "Student";`);
  const gaps: number[] = [];
  for (let i = 1; i <= maxRow[0].max; i++) if (!set.has(i)) gaps.push(i);
  console.log(`\nПропуски: ${gaps.join(", ")}`);

  // Присваиваем пропуски активным без ID
  const apply = process.argv.includes("--apply");
  console.log(`\n${apply ? "APPLY" : "DRY-RUN"}: раздаём пропуски активным без ID:`);
  for (let i = 0; i < Math.min(noId.length, gaps.length); i++) {
    const s = noId[i]; const num = gaps[i];
    console.log(`  #${num} → ${s.lastName} ${s.firstName}`);
    if (apply) await prisma.student.update({ where: { id: s.id }, data: { studentNumber: num } });
  }
  if (noId.length > gaps.length) {
    console.log(`\n${noId.length - gaps.length} ученикам не хватило пропусков — им дадим следующие после MAX:`);
    let next = Number(maxRow[0].max) + 1;
    for (let i = gaps.length; i < noId.length; i++) {
      const s = noId[i];
      console.log(`  #${next} → ${s.lastName} ${s.firstName}`);
      if (apply) await prisma.student.update({ where: { id: s.id }, data: { studentNumber: next } });
      next++;
    }
    if (apply) await prisma.$executeRawUnsafe(`SELECT setval('student_number_seq', $1, true);`, next - 1);
  }
}
main().finally(() => prisma.$disconnect());
