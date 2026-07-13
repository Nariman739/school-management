import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
const SINCE = new Date("2026-07-10T14:14:36.384Z");
(async () => {
  const rows = await prisma.auditLog.findMany({ where: { createdAt: { gt: SINCE } }, orderBy: { createdAt: "asc" } });
  const byKey = new Map<string, number>();
  for (const a of rows) byKey.set(`${a.action} ${a.entityType}`, (byKey.get(`${a.action} ${a.entityType}`) ?? 0) + 1);
  console.log(`Всего операций: ${rows.length}`);
  for (const [k, v] of [...byKey.entries()].sort((a,b)=>b[1]-a[1])) console.log(`   ${k}: ${v}`);
  const byDay = new Map<string, number>();
  for (const a of rows) { const d = a.createdAt.toISOString().slice(0,10); byDay.set(d, (byDay.get(d) ?? 0) + 1); }
  console.log("\nПо дням:");
  for (const [d, v] of [...byDay.entries()].sort()) console.log(`   ${d}: ${v}`);
  if (rows.length) console.log(`\nПервая: ${rows[0].createdAt.toISOString()} (${rows[0].action} ${rows[0].entityType})`);
  if (rows.length) console.log(`Последняя: ${rows[rows.length-1].createdAt.toISOString()} (${rows[rows.length-1].action} ${rows[rows.length-1].entityType})`);
  await prisma.$disconnect();
})();
