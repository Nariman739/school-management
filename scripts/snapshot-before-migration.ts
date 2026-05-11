// Снимок ключевых таблиц в JSON ПЕРЕД запуском migrate-services-v1
// Использует сырой SQL потому что Prisma client уже знает про новые колонки,
// а в БД их ещё нет (мы делаем снимок ДО schema push).
// Запуск: npx tsx scripts/snapshot-before-migration.ts
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Snapshot pre-migration...");

  const [
    students,
    groups,
    groupMembers,
    scheduleSlots,
    tariffHistory,
    teachers,
    payments,
    attendances,
  ] = await Promise.all([
    prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "Student"`),
    prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "Group"`),
    prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "GroupMember"`),
    prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "ScheduleSlot"`),
    prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "TariffHistory"`),
    prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "Teacher"`),
    prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "Payment"`),
    prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "Attendance"`),
  ]);

  const snapshot = {
    takenAt: new Date().toISOString(),
    students,
    groups,
    groupMembers,
    scheduleSlots,
    tariffHistory,
    teachers,
    payments,
    attendances,
  };

  const filename = `neon-snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const filepath = path.join(__dirname, "..", "backups", filename);
  fs.writeFileSync(filepath, JSON.stringify(snapshot, null, 2));

  console.log(`✓ Saved to: ${filepath}`);
  console.log(`  Students: ${students.length}`);
  console.log(`  Groups: ${groups.length}`);
  console.log(`  GroupMembers: ${groupMembers.length}`);
  console.log(`  ScheduleSlots: ${scheduleSlots.length}`);
  console.log(`  TariffHistory: ${tariffHistory.length}`);
  console.log(`  Teachers: ${teachers.length}`);
  console.log(`  Payments: ${payments.length}`);
  console.log(`  Attendances: ${attendances.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
