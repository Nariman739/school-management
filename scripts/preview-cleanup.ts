import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  // Ученики без номера
  const sNoNum = await prisma.student.findMany({
    where: { studentNumber: null, isActive: true },
    select: {
      id: true, lastName: true, firstName: true, patronymic: true, isActive: true,
      _count: { select: { scheduleSlots: true, attendances: true, payments: true } },
    },
    orderBy: [{ lastName: "asc" }],
  });
  console.log(`\n=== УЧЕНИКИ без номера и активных: ${sNoNum.length} ===`);
  for (const s of sNoNum) {
    const tags = [];
    if (s._count.scheduleSlots > 0) tags.push(`слоты:${s._count.scheduleSlots}`);
    if (s._count.attendances > 0) tags.push(`посещ:${s._count.attendances}`);
    if (s._count.payments > 0) tags.push(`оплат:${s._count.payments}`);
    console.log(`  ${s.lastName} ${s.firstName} ${s.patronymic ?? ""}   ${tags.join(" / ") || "(нет истории)"}`);
  }

  // Педагоги без номера
  const tNoNum = await prisma.teacher.findMany({
    where: { teacherNumber: null, isActive: true },
    select: {
      id: true, lastName: true, firstName: true, patronymic: true,
      _count: { select: { scheduleSlots: true } },
    },
    orderBy: [{ lastName: "asc" }],
  });
  console.log(`\n=== ПЕДАГОГИ без номера и активных: ${tNoNum.length} ===`);
  for (const t of tNoNum) {
    const tag = t._count.scheduleSlots > 0 ? `слоты:${t._count.scheduleSlots}` : "(нет истории)";
    console.log(`  ${t.lastName} ${t.firstName} ${t.patronymic ?? ""}   ${tag}`);
  }
}
main().finally(() => prisma.$disconnect());
