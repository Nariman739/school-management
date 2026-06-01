import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
async function main() {
  for (const n of ["Дима", "Мирон", "Ернур", "Ератир", "Рамазан", "Расул", "Ератир", "Ясмина", "Ясмин"]) {
    const r = await prisma.student.findMany({
      where: { firstName: { contains: n, mode: "insensitive" } },
      select: { lastName: true, firstName: true },
    });
    console.log(`${n}: ${r.length} → ${r.map((s) => `${s.firstName} ${s.lastName}`).join(", ")}`);
  }
}
main().finally(() => prisma.$disconnect());
