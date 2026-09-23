import * as dotenv from "dotenv"; import { PrismaClient } from "../src/generated/prisma/client"; import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config(); const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
(async()=>{ const s = await prisma.student.findFirst({where:{lastName:"ТестовыйФамилий"}}); console.log(s?`ещё есть: ${s.id} active=${s.isActive}`:"✅ тестовый ученик удалён"); const t=await prisma.student.count(); console.log(`Учеников всего: ${t}`); await prisma.$disconnect(); })();
