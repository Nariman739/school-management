import * as dotenv from "dotenv"; import { PrismaClient } from "../src/generated/prisma/client"; import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config(); const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
(async()=>{
  const around = await prisma.student.findMany({ where: { studentNumber: { gte: 121, lte: 127 } }, orderBy: { studentNumber: "asc" }, select: { id:true, studentNumber:true, lastName:true, firstName:true, isActive:true } });
  console.log("Ученики #121–127:");
  for (const s of around) console.log(`   #${s.studentNumber} ${s.lastName} ${s.firstName} active=${s.isActive} [${s.id.slice(0,8)}]`);
  const at123 = await prisma.student.findFirst({ where: { studentNumber: 123 } });
  console.log(`\n#123 занят? ${at123 ? "ДА — "+at123.lastName : "НЕТ (свободен)"}`);
  const zara = await prisma.student.findMany({ where: { firstName: { contains: "Зара" } }, select: { id:true, studentNumber:true, lastName:true, firstName:true, isActive:true } });
  console.log("\nЗара(ы) в базе:");
  for (const s of zara) console.log(`   #${s.studentNumber} ${s.lastName} ${s.firstName} active=${s.isActive} [${s.id.slice(0,8)}]`);
  await prisma.$disconnect();
})();
