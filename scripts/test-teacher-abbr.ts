import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
async function main() {
  const t = await prisma.teacher.findMany({ where: { isActive: true } });
  for (const target of ["Нигмат", "Роман", "Артур", "Тамерлан", "Дильназ", "Даяна"]) {
    const found = t.filter((x) => x.firstName.startsWith(target));
    console.log(`[${target}]: ${found.length}`);
    for (const x of found) console.log(`  #${x.teacherNumber} ${x.lastName} ${x.firstName} ${x.patronymic}`);
  }
}
main().finally(() => prisma.$disconnect());
