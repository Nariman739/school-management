import * as dotenv from "dotenv"; import { PrismaClient } from "../src/generated/prisma/client"; import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config(); const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
(async()=>{ const z = await prisma.student.findFirst({where:{firstName:{contains:"Зара"}}}); console.log(z?.id); await prisma.$disconnect(); })();
