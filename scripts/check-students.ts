import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config();
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
async function main() {
  for (const name of ["Алихан", "Ансар", "Арнур", "Эмир", "Хамза", "Самир", "Ералы", "Шахназар", "Тамерлан"]) {
    const matches = await prisma.student.findMany({
      where: { firstName: { equals: name, mode: "insensitive" } },
      select: { lastName: true, firstName: true },
    });
    console.log(`${name}: ${matches.length} → ${matches.map(s => s.lastName).join(", ")}`);
  }
}
main().finally(() => prisma.$disconnect());
