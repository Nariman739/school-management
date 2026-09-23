// Применение «Список_детей обнов.xlsx» к базе: завести новых, отметить «не ходит»,
// поправить опечатки в ФИО, сохранить сокращения как псевдонимы для импорта.
// По умолчанию — сухой прогон. Запись только с флагом --apply.
// Запуск: npx tsx scripts/apply-students-file.ts <файл.xlsx> [--apply]
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

dotenv.config();
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
const APPLY = process.argv.includes("--apply");

async function main() {
  const file = process.argv[2];
  const wb = XLSX.readFile(file);
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    blankrows: false,
    raw: false,
  }) as string[][];

  const rows = raw
    .slice(1)
    .map((r) => ({
      num: r[0] != null && String(r[0]).trim() !== "" ? Number(String(r[0]).trim()) : null,
      firstName: (r[1] ?? "").trim(),
      lastName: (r[2] ?? "").trim(),
      active: String(r[3] ?? "").trim() !== "0",
      abbr: (r[4] ?? "").trim(),
    }))
    .filter((r) => r.firstName || r.lastName);

  const students = await prisma.student.findMany();

  // снимок для отката
  const backup = `backups/students-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.mkdirSync("backups", { recursive: true });
  fs.writeFileSync(backup, JSON.stringify(students, null, 2));
  console.log(`Снимок базы: ${backup} (${students.length} записей)\n`);

  const byNum = new Map(students.filter((s) => s.studentNumber != null).map((s) => [s.studentNumber!, s]));
  const byName = new Map(students.map((s) => [norm(`${s.lastName} ${s.firstName}`), s]));

  const toCreate: typeof rows = [];
  const toDeactivate: { id: string; label: string }[] = [];
  const toRename: { id: string; from: string; to: string }[] = [];
  const aliasRows: { abbr: string; row: (typeof rows)[number] }[] = [];

  for (const row of rows) {
    const fileName = norm(`${row.lastName} ${row.firstName}`);
    const hit = (row.num != null ? byNum.get(row.num) : undefined) ?? byName.get(fileName);

    if (!hit) {
      toCreate.push(row);
      if (row.abbr) aliasRows.push({ abbr: row.abbr, row });
      continue;
    }
    if (norm(`${hit.lastName} ${hit.firstName}`) !== fileName) {
      toRename.push({
        id: hit.id,
        from: `${hit.lastName} ${hit.firstName}`,
        to: `${row.lastName} ${row.firstName}`,
      });
    }
    if (!row.active && hit.isActive) {
      toDeactivate.push({ id: hit.id, label: `#${row.num} ${row.lastName} ${row.firstName}` });
    }
    if (row.abbr) aliasRows.push({ abbr: row.abbr, row });
  }

  console.log(`Создать: ${toCreate.length}`);
  console.log(`Отметить «не ходит»: ${toDeactivate.length}`);
  console.log(`Исправить ФИО: ${toRename.length}${toRename.map((r) => `\n   ${r.from} → ${r.to}`).join("")}`);
  console.log(`Сохранить сокращений: ${aliasRows.length}\n`);

  if (!APPLY) {
    console.log("Сухой прогон. Для записи добавьте --apply");
    await prisma.$disconnect();
    return;
  }

  // 1. Новые ученики — номер берём из файла (это нумерация Дархана, она же в расписании)
  const created: Record<string, string> = {};
  for (const row of toCreate) {
    const taken = row.num != null ? await prisma.student.findUnique({ where: { studentNumber: row.num } }) : null;
    const student = await prisma.student.create({
      data: {
        firstName: row.firstName,
        lastName: row.lastName,
        studentNumber: taken ? null : row.num,
        isActive: row.active,
      },
    });
    created[norm(`${row.lastName} ${row.firstName}`)] = student.id;
    if (taken) console.log(`   ⚠ номер #${row.num} занят — ${row.lastName} ${row.firstName} создан без номера`);
  }
  console.log(`Создано учеников: ${toCreate.length}`);

  // 2. Опечатки в ФИО
  for (const r of toRename) {
    const [lastName, ...rest] = r.to.split(" ");
    await prisma.student.update({ where: { id: r.id }, data: { lastName, firstName: rest.join(" ") } });
  }
  console.log(`Исправлено ФИО: ${toRename.length}`);

  // 3. «Не ходит»
  for (const d of toDeactivate) {
    await prisma.student.update({ where: { id: d.id }, data: { isActive: false } });
  }
  console.log(`Отмечено «не ходит»: ${toDeactivate.length}`);

  // 4. Сокращения → псевдонимы (ключ матчинга при импорте расписания)
  const fresh = await prisma.student.findMany({ select: { id: true, firstName: true, lastName: true } });
  const idByName = new Map(fresh.map((s) => [norm(`${s.lastName} ${s.firstName}`), s.id]));
  let aliases = 0;
  for (const a of aliasRows) {
    const id = idByName.get(norm(`${a.row.lastName} ${a.row.firstName}`));
    if (!id) continue;
    await prisma.nameAlias.upsert({
      where: { alias_type: { alias: a.abbr, type: "student" } },
      create: { alias: a.abbr, type: "student", entityId: id },
      update: { entityId: id },
    });
    aliases++;
  }
  console.log(`Сохранено сокращений: ${aliases}`);

  await prisma.$disconnect();
}

main();
