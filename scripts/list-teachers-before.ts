import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
async function main() {
  const teachers = await prisma.teacher.findMany({
    where: { createdAt: { lt: new Date("2026-05-31T00:00:00Z") } },
    select: { lastName: true, firstName: true, patronymic: true, createdAt: true },
    orderBy: [{ firstName: "asc" }],
  });
  console.log(`Педагогов до 2026-05-31 (моё сегодняшнее добавление): ${teachers.length}`);
  for (const t of teachers) {
    console.log(`  ${t.firstName} ${t.patronymic ?? ""} / ${t.lastName}`);
  }
}
main().finally(() => prisma.$disconnect());
