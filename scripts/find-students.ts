import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
async function main() {
  const s = await prisma.student.findMany({ where: { isActive: true } });
  for (const target of ["Асан", "Ердар", "Алинур", "Асан", "Айсб", "Малика", "Ансар"]) {
    const found = s.filter((x) => x.firstName.startsWith(target) || x.lastName.startsWith(target));
    console.log(`[${target}]: ${found.length}`);
    for (const x of found) console.log(`  #${x.studentNumber} ${x.lastName} ${x.firstName}`);
  }
}
main().finally(() => prisma.$disconnect());
