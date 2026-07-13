// Монитор активности Дархана на проде во время тестирования импорта.
// Первый запуск ставит baseline. Каждый следующий показывает, ЧТО изменилось:
//   • сколько новых слотов расписания (импортировал),
//   • каких учеников создал,
//   • какие ячейки сопоставил ВРУЧНУЮ (NameAlias) — это где парсер не справился,
//   • свежие операции из AuditLog.
// Запуск: npx tsx scripts/watch-darkhan.ts
import * as fs from "fs";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

dotenv.config();
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const BASELINE = "/tmp/darkhan-watch-baseline.json";

async function main() {
  const [slots, students, aliases, audit] = await Promise.all([
    prisma.scheduleSlot.count(),
    prisma.student.count(),
    prisma.nameAlias.count(),
    prisma.auditLog.count(),
  ]);
  const now = new Date().toISOString();

  if (!fs.existsSync(BASELINE)) {
    fs.writeFileSync(BASELINE, JSON.stringify({ ts: now, slots, students, aliases, audit }, null, 2));
    console.log(`🟢 Базлайн установлен (${now})`);
    console.log(`   Сейчас: слотов ${slots}, учеников ${students}, алиасов ${aliases}, аудита ${audit}`);
    console.log(`   Жду, когда Дархан начнёт тестить. Запусти снова после его активности.`);
    return;
  }

  const base = JSON.parse(fs.readFileSync(BASELINE, "utf-8"));
  const since = new Date(base.ts);
  const dSlots = slots - base.slots;
  const dStudents = students - base.students;
  const dAliases = aliases - base.aliases;
  const dAudit = audit - base.audit;

  console.log(`📊 Изменения с ${base.ts} (сейчас ${now}):`);
  console.log(`   Слоты: ${dSlots >= 0 ? "+" : ""}${dSlots}   Ученики: ${dStudents >= 0 ? "+" : ""}${dStudents}   Алиасы: +${dAliases}   Аудит: +${dAudit}`);

  if (dSlots === 0 && dStudents === 0 && dAliases === 0 && dAudit === 0) {
    console.log("\n💤 Пока тишина — Дархан ещё не тестил (или ничего не сохранил).");
    return;
  }

  // Новые ручные сопоставления — где парсер не справился
  const newAliases = await prisma.nameAlias.findMany({ where: { createdAt: { gt: since } }, orderBy: { createdAt: "asc" } });
  if (newAliases.length) {
    console.log(`\n🔧 Сопоставил вручную (${newAliases.length}) — парсер это НЕ распознал сам:`);
    for (const a of newAliases) {
      let target = a.entityId;
      if (a.type === "student") {
        const s = await prisma.student.findUnique({ where: { id: a.entityId } });
        if (s) target = `${s.lastName} ${s.firstName}${s.studentNumber != null ? ` #${s.studentNumber}` : ""}`;
      } else if (a.type === "group") {
        const g = await prisma.group.findUnique({ where: { id: a.entityId } });
        if (g) target = `гр ${g.name ?? ""}`;
      } else if (a.type === "teacher") {
        const t = await prisma.teacher.findUnique({ where: { id: a.entityId } });
        if (t) target = `${t.lastName} ${t.firstName}`;
      }
      console.log(`   «${a.alias}» → ${target}  [${a.type}]`);
    }
  }

  // Новые ученики (создал через резолвер или вручную)
  const newStudents = await prisma.student.findMany({ where: { createdAt: { gt: since } }, orderBy: { createdAt: "asc" } });
  if (newStudents.length) {
    console.log(`\n👤 Создал учеников (${newStudents.length}):`);
    for (const s of newStudents) console.log(`   ${s.lastName} ${s.firstName}${s.studentNumber != null ? ` #${s.studentNumber}` : ""}`);
  }

  // Аудит операций
  const newAudit = await prisma.auditLog.findMany({ where: { createdAt: { gt: since } }, orderBy: { createdAt: "asc" }, take: 60 });
  if (newAudit.length) {
    const byKey = new Map<string, number>();
    for (const a of newAudit) byKey.set(`${a.action} ${a.entityType}`, (byKey.get(`${a.action} ${a.entityType}`) ?? 0) + 1);
    console.log(`\n📝 Операции (AuditLog, ${newAudit.length}):`);
    for (const [k, v] of byKey) console.log(`   ${k}: ${v}`);
  }

  // Обновляем baseline
  fs.writeFileSync(BASELINE, JSON.stringify({ ts: now, slots, students, aliases, audit }, null, 2));
  console.log(`\n✔ Базлайн обновлён.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
