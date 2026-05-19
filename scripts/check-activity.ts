// Проверка активности на проде за последние N дней
// Запуск: npx tsx scripts/check-activity.ts
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import * as dotenv from "dotenv";

dotenv.config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const days = 7;
  const since = new Date();
  since.setDate(since.getDate() - days);
  console.log(`=== Активность с ${since.toISOString().split("T")[0]} ===\n`);

  // 1. AuditLog (фиксируются CREATE/UPDATE/DELETE через UI)
  const auditCount = await prisma.auditLog.count({ where: { createdAt: { gte: since } } });
  console.log(`[AuditLog] всего операций: ${auditCount}`);

  if (auditCount > 0) {
    const byEntity = await prisma.$queryRawUnsafe<{ entityType: string; action: string; count: bigint }[]>(
      `SELECT "entityType", action, COUNT(*)::bigint AS count
       FROM "AuditLog"
       WHERE "createdAt" >= $1
       GROUP BY "entityType", action
       ORDER BY count DESC`,
      since,
    );
    console.log("\n  по типам:");
    for (const r of byEntity) console.log(`    ${r.entityType.padEnd(20)} ${r.action.padEnd(8)} ${r.count}`);

    const byDay = await prisma.$queryRawUnsafe<{ day: string; count: bigint }[]>(
      `SELECT DATE("createdAt") AS day, COUNT(*)::bigint AS count
       FROM "AuditLog"
       WHERE "createdAt" >= $1
       GROUP BY DATE("createdAt")
       ORDER BY day DESC`,
      since,
    );
    console.log("\n  по дням:");
    for (const r of byDay) console.log(`    ${r.day} — ${r.count} операций`);

    const recent = await prisma.auditLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    console.log("\n  последние 10:");
    for (const r of recent) {
      console.log(`    ${r.createdAt.toISOString()} ${r.entityType}/${r.action} (user: ${r.userName ?? "—"})`);
    }
  }

  // 2. Свежие StudentServicePrice — Дархан заполнял матрицу?
  const newPrices = await prisma.studentServicePrice.count({ where: { createdAt: { gte: since } } });
  const updatedPrices = await prisma.studentServicePrice.count({
    where: { updatedAt: { gte: since }, NOT: { createdAt: { gte: since } } },
  });
  console.log(`\n[StudentServicePrice] новые: ${newPrices}, обновлены: ${updatedPrices}`);

  // 3. Новые пары
  const newPairs = await prisma.group.count({
    where: { groupType: "PAIR", createdAt: { gte: since } },
  });
  console.log(`[Group(PAIR)] новые пары: ${newPairs}`);

  // 4. Новые слоты в расписании
  const newSlots = await prisma.scheduleSlot.count({ where: {} });
  const recentSlots = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM "ScheduleSlot"
     WHERE id IN (SELECT id FROM "ScheduleSlot" ORDER BY id DESC LIMIT 200)`,
  );
  console.log(`[ScheduleSlot] всего: ${newSlots} (recent batch: ${recentSlots[0]?.count})`);

  // 5. Свежие отметки посещаемости
  const newAtt = await prisma.attendance.count({ where: { markedAt: { gte: since } } });
  console.log(`[Attendance] отметок за период: ${newAtt}`);

  // 6. Новые ServiceType (Дархан мог переименовать или добавить)
  const services = await prisma.serviceType.findMany({ orderBy: { sortOrder: "asc" } });
  console.log(`\n[ServiceType] текущие ${services.length}:`);
  for (const s of services) {
    const recentlyUpdated = s.updatedAt >= since ? " ⟵ обновлён в этот период" : "";
    console.log(`  ${s.code}: ${s.name} (${s.kind}, active=${s.isActive})${recentlyUpdated}`);
  }

  // 7. Использование 2-го ассистента (фича от 13 мая)
  const assist2 = await prisma.attendance.count({ where: { assistant2TeacherId: { not: null } } });
  console.log(`\n[Attendance.assistant2TeacherId] использований: ${assist2}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
