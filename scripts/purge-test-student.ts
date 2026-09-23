import * as dotenv from "dotenv"; import { PrismaClient } from "../src/generated/prisma/client"; import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config(); const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
(async()=>{
  const s = await prisma.student.findFirst({where:{lastName:"ТестовыйФамилий"}});
  if(!s){ console.log("нет тестового"); await prisma.$disconnect(); return; }
  // убедимся что нет ссылок
  const refs = await prisma.scheduleSlot.count({where:{studentId:s.id}}) + await prisma.studentServicePrice.count({where:{studentId:s.id}}) + await prisma.attendance.count({where:{studentId:s.id}});
  console.log(`ссылок у тестового: ${refs}`);
  if(refs===0){ await prisma.student.delete({where:{id:s.id}}); console.log("✅ тестовый жёстко удалён"); }
  else console.log("есть ссылки — не удаляю");
  console.log(`Учеников всего: ${await prisma.student.count()} (активных ${await prisma.student.count({where:{isActive:true}})})`);
  await prisma.$disconnect();
})();
