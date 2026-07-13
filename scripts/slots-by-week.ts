import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
(async () => {
  const slots = await prisma.scheduleSlot.groupBy({ by: ["weekStartDate"], _count: true });
  console.log("Слоты по неделям (weekStartDate → кол-во):");
  for (const s of slots.sort((a,b)=> (a.weekStartDate>b.weekStartDate?1:-1))) console.log(`   ${s.weekStartDate}: ${s._count}`);
  // Стажировки в БД?
  const intern = await prisma.scheduleSlot.count({ where: { lessonCategory: "Стажировка" } });
  console.log(`\nСлотов-стажировок в БД: ${intern}`);
  // Дубли Алинур
  const al = await prisma.student.findMany({ where: { firstName: { contains: "линур" } }, select: { firstName: true, lastName: true, studentNumber: true, createdAt: true } });
  console.log("\nУченики с 'линур' в имени:");
  for (const s of al) console.log(`   ${s.lastName} ${s.firstName} #${s.studentNumber} (создан ${s.createdAt.toISOString().slice(0,10)})`);
  await prisma.$disconnect();
})();
