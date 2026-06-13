import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const tWithNum = await prisma.teacher.count({ where: { teacherNumber: { not: null }, isActive: true } });
  const tTotal = await prisma.teacher.count({ where: { isActive: true } });
  const sWithNum = await prisma.student.count({ where: { studentNumber: { not: null }, isActive: true } });
  const sTotal = await prisma.student.count({ where: { isActive: true } });
  console.log(`Педагоги: ${tWithNum}/${tTotal} с номерами`);
  console.log(`Ученики: ${sWithNum}/${sTotal} с номерами`);

  // Первые 5 педагогов
  const tt = await prisma.teacher.findMany({
    where: { teacherNumber: { not: null } },
    orderBy: { teacherNumber: "asc" },
    select: { teacherNumber: true, lastName: true, firstName: true },
    take: 5,
  });
  console.log("\nПервые педагоги:");
  for (const t of tt) console.log(`  #${t.teacherNumber} ${t.lastName} ${t.firstName}`);

  // Первые 5 учеников
  const ss = await prisma.student.findMany({
    where: { studentNumber: { not: null } },
    orderBy: { studentNumber: "asc" },
    select: { studentNumber: true, lastName: true, firstName: true },
    take: 5,
  });
  console.log("\nПервые ученики:");
  for (const s of ss) console.log(`  #${s.studentNumber} ${s.lastName} ${s.firstName}`);
}
main().finally(() => prisma.$disconnect());
