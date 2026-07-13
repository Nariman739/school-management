// Слияние дублей учеников. Канон = активная запись с номером (новая, от Дархана);
// в неё переносим ВСЮ историю (слоты/посещаемость/оплаты/цены/группы) со старых
// неактивных копий, затем удаляем пустышки. Группы без активной записи с номером —
// ПРОПУСКАЕМ (решить вручную). По умолчанию СУХОЙ ПРОГОН. Запись: MERGE_EXECUTE=1
import * as fs from "fs";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
const EXECUTE = process.env.MERGE_EXECUTE === "1";
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "").trim();

// Таблицы со studentId. PLAIN — простой перенос; UNIQUE — построчно с обработкой конфликтов.
const PLAIN = ["studentFreeze", "recalculation", "tariffHistory", "scheduleSlot", "scheduleFreeze", "payment", "parentInteraction"] as const;
const UNIQUE = ["studentServicePrice", "groupMember", "slotAttendee", "attendance"] as const;
const ALL = [...PLAIN, ...UNIQUE];

async function refCount(id: string) {
  let n = 0;
  for (const m of ALL) n += await (prisma as any)[m].count({ where: { studentId: id } });
  return n;
}

async function main() {
  console.log(EXECUTE ? "🔴 РЕЖИМ ЗАПИСИ\n" : "🟡 СУХОЙ ПРОГОН — ничего не пишем. Для записи: MERGE_EXECUTE=1\n");
  const students = await prisma.student.findMany();
  const groups = new Map<string, typeof students>();
  for (const s of students) {
    const k = `${norm(s.lastName)}|${norm(s.firstName)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  }
  const dupGroups = [...groups.values()].filter((a) => a.length > 1);

  // Полный бэкап затронутых учеников + всех их ссылок
  const backup: any = { ts: new Date().toISOString(), groups: [] };
  for (const grp of dupGroups) {
    const g: any = { name: `${grp[0].lastName} ${grp[0].firstName}`, students: grp, refs: {} };
    for (const s of grp) {
      g.refs[s.id] = {};
      for (const m of ALL) g.refs[s.id][m] = await (prisma as any)[m].findMany({ where: { studentId: s.id } });
    }
    backup.groups.push(g);
  }
  const backupPath = `/tmp/dup-backup-${Date.now()}.json`;
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`💾 Бэкап (записи + все ссылки): ${backupPath}\n`);

  let merged = 0, skipped = 0;
  for (const grp of dupGroups) {
    const withRefs: { s: (typeof students)[number]; refs: number }[] = [];
    for (const s of grp) withRefs.push({ s, refs: await refCount(s.id) });
    const name = `${grp[0].lastName} ${grp[0].firstName}`;
    const canonCands = withRefs.filter((x) => x.s.isActive && x.s.studentNumber != null);
    if (canonCands.length === 0) {
      console.log(`⏭  ${name}: нет активной записи с номером — ПРОПУСК (решить вручную)`);
      skipped++;
      continue;
    }
    const canon = canonCands.sort((a, b) => b.refs - a.refs)[0].s;
    const others = withRefs.filter((x) => x.s.id !== canon.id);
    console.log(`━━ ${name} → КАНОН #${canon.studentNumber} [${canon.id.slice(0, 8)}]`);
    for (const { s, refs } of others) {
      console.log(`   ${EXECUTE ? "слил" : "СОЛЬЁТ"} #${s.studentNumber ?? "—"} [${s.id.slice(0, 8)}] active=${s.isActive}, перенос ${refs} ссылок`);
      if (!EXECUTE) continue;
      for (const m of PLAIN) await (prisma as any)[m].updateMany({ where: { studentId: s.id }, data: { studentId: canon.id } });
      for (const m of UNIQUE) {
        const rows = await (prisma as any)[m].findMany({ where: { studentId: s.id } });
        for (const row of rows) {
          try { await (prisma as any)[m].update({ where: { id: row.id }, data: { studentId: canon.id } }); }
          catch (e: any) { if (e.code === "P2002") await (prisma as any)[m].delete({ where: { id: row.id } }); else throw e; }
        }
      }
      await prisma.student.delete({ where: { id: s.id } });
    }
    merged++;
  }
  console.log(`\nИтог: ${EXECUTE ? "слито" : "будет слито"} групп ${merged}, пропущено ${skipped}.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
