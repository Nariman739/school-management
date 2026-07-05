import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
async function main() {
  const inactive = await prisma.student.findMany({
    where: { isActive: false },
    select: { studentNumber: true, lastName: true, firstName: true, updatedAt: true },
  });
  const withNum = inactive.filter((s) => s.studentNumber !== null);
  const noNum = inactive.filter((s) => s.studentNumber === null);
  console.log(`Неактивных всего: ${inactive.length}`);
  console.log(`  С номером: ${withNum.length}`);
  console.log(`  Без номера: ${noNum.length}`);
  console.log(`\nНеактивные С номером (для примера):`);
  for (const s of withNum.slice(0, 5)) console.log(`  #${s.studentNumber} ${s.lastName} ${s.firstName}`);
}
main().finally(() => prisma.$disconnect());
