import * as dotenv from "dotenv"; import { PrismaClient } from "../src/generated/prisma/client"; import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config(); const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
(async()=>{
  const at123 = await prisma.student.findFirst({ where: { studentNumber: 123 } });
  if (at123) { console.log(`❌ #123 занят (${at123.lastName} ${at123.firstName}) — отмена`); await prisma.$disconnect(); return; }
  const zara = await prisma.student.findFirst({ where: { firstName: { contains: "Зара" }, lastName: { contains: "Мырзагали" } } });
  if (!zara) { console.log("❌ Зара не найдена"); await prisma.$disconnect(); return; }
  if (zara.studentNumber !== 124) { console.log(`⚠ у Зары уже #${zara.studentNumber}, не 124 — проверь вручную`); await prisma.$disconnect(); return; }
  await prisma.student.update({ where: { id: zara.id }, data: { studentNumber: 123 } });
  console.log(`✅ Мырзагали Зара: #124 → #123`);
  const around = await prisma.student.findMany({ where: { studentNumber: { gte: 121, lte: 126 } }, orderBy: { studentNumber: "asc" }, select: { studentNumber:true, lastName:true, firstName:true } });
  console.log("Теперь:"); for (const s of around) console.log(`   #${s.studentNumber} ${s.lastName} ${s.firstName}`);
  await prisma.$disconnect();
})();
