import * as dotenv from "dotenv"; import { PrismaClient } from "../src/generated/prisma/client"; import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config(); const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
const SINCE = new Date("2026-07-21T00:00:00.000Z");
(async()=>{
  const rows = await prisma.auditLog.findMany({ where: { createdAt: { gt: SINCE } }, orderBy: { createdAt: "asc" } });
  console.log(`Операций с 21.07: ${rows.length}`);
  const byKey = new Map<string,number>(); for (const a of rows) byKey.set(`${a.action} ${a.entityType}`,(byKey.get(`${a.action} ${a.entityType}`)??0)+1);
  for (const [k,v] of [...byKey.entries()].sort((a,b)=>b[1]-a[1])) console.log(`   ${k}: ${v}`);
  const byDay = new Map<string,number>(); for (const a of rows) { const d=a.createdAt.toISOString().slice(0,10); byDay.set(d,(byDay.get(d)??0)+1); }
  console.log("\nПо дням (когда заходил):"); for (const [d,v] of [...byDay.entries()].sort()) console.log(`   ${d}: ${v}`);
  if (rows.length){ console.log(`\nПоследняя активность: ${rows[rows.length-1].createdAt.toISOString()} (${rows[rows.length-1].action} ${rows[rows.length-1].entityType})`); }
  // сегодняшние слоты по неделям — вдруг импортировал
  const bySlotWeek = await prisma.scheduleSlot.groupBy({ by: ["weekStartDate"], _count: true });
  const recentWeeks = bySlotWeek.filter(w=>w.weekStartDate >= "2026-07-13").sort((a,b)=>a.weekStartDate>b.weekStartDate?1:-1);
  console.log("\nСлоты по неделям (>=13.07):"); for (const w of recentWeeks) console.log(`   ${w.weekStartDate}: ${w._count}`);
  const interns = await prisma.scheduleSlot.count({ where: { lessonCategory: "Стажировка" } });
  console.log(`\nСлотов-стажировок в БД: ${interns}`);
  await prisma.$disconnect();
})();
