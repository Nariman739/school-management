// Проверка результата миграции — что цифры сходятся.
// Запуск: npx tsx scripts/verify-migration.ts
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import * as dotenv from "dotenv";

dotenv.config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== Verify migration ===");

  const services = await prisma.serviceType.findMany({ orderBy: { sortOrder: "asc" } });
  console.log(`\n[ServiceType] ${services.length} строк:`);
  for (const s of services) console.log(`  ${s.sortOrder}. ${s.code} — ${s.name} (${s.kind})`);

  const studentsWithNum = await prisma.student.count({ where: { studentNumber: { not: null } } });
  const studentsTotal = await prisma.student.count();
  console.log(`\n[Student.studentNumber] ${studentsWithNum}/${studentsTotal} с номером`);

  const studentsWithRate = await prisma.student.count({ where: { hourlyRate: { gt: 0 } } });
  const prices = await prisma.studentServicePrice.count();
  console.log(`\n[StudentServicePrice] ${prices} строк (учеников с hourlyRate>0 было: ${studentsWithRate})`);

  const groupsByType = await prisma.$queryRawUnsafe<{ groupType: string; count: bigint }[]>(
    `SELECT "groupType", COUNT(*)::bigint AS count FROM "Group" GROUP BY "groupType" ORDER BY count DESC`,
  );
  console.log(`\n[Group.groupType]`);
  for (const r of groupsByType) console.log(`  ${r.groupType}: ${r.count}`);

  const slotsWithService = await prisma.scheduleSlot.count({ where: { serviceTypeId: { not: null } } });
  const slotsTotal = await prisma.scheduleSlot.count();
  console.log(`\n[ScheduleSlot.serviceTypeId] ${slotsWithService}/${slotsTotal} с типом услуги`);

  const slotsWithPrice = await prisma.scheduleSlot.count({ where: { frozenPrice: { not: null } } });
  console.log(`[ScheduleSlot.frozenPrice] ${slotsWithPrice}/${slotsTotal} со снимком цены`);

  // Образец — несколько учеников с их ценами
  const sampleStudents = await prisma.student.findMany({
    take: 5,
    orderBy: { studentNumber: "asc" },
    include: { servicePrices: { include: { serviceType: true } } },
  });
  console.log(`\n[Sample] первые 5 учеников по номеру:`);
  for (const s of sampleStudents) {
    const labels = s.servicePrices
      .map((p) => `${p.serviceType.name}: ${p.price}₸`)
      .join(", ");
    console.log(`  #${s.studentNumber} ${s.lastName} ${s.firstName} — ${labels || "(нет цен)"}`);
  }

  // Образец пар
  const pairs = await prisma.group.findMany({
    where: { groupType: "PAIR" },
    take: 5,
    include: { members: { include: { student: true } } },
  });
  console.log(`\n[Sample] пары (${pairs.length} в выборке):`);
  for (const p of pairs) {
    const names = p.members.map((m) => `${m.student.firstName} ${m.student.lastName}`).join(" + ");
    console.log(`  ${p.id.slice(0, 8)} → ${names}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
