// Сверка присланного «Список_детей обнов.xlsx» с базой. ТОЛЬКО ЧТЕНИЕ.
// Колонки файла: ID | Имя | Фамилия | Ходит/не ходит (1/0) | В расписании | Направления
// Запуск: npx tsx scripts/diff-students-file.ts <файл.xlsx>
import * as XLSX from "xlsx";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

dotenv.config();
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

type Row = {
  num: number | null;
  firstName: string;
  lastName: string;
  active: boolean;
  abbr: string;
  directions: string;
};

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

async function main() {
  const file = process.argv[2];
  const wb = XLSX.readFile(file);
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    blankrows: false,
    raw: false,
  }) as string[][];

  const rows: Row[] = [];
  for (const r of raw.slice(1)) {
    const firstName = (r[1] ?? "").trim();
    const lastName = (r[2] ?? "").trim();
    if (!firstName && !lastName) continue;
    rows.push({
      num: r[0] != null && String(r[0]).trim() !== "" ? Number(String(r[0]).trim()) : null,
      firstName,
      lastName,
      active: String(r[3] ?? "").trim() !== "0",
      abbr: (r[4] ?? "").trim(),
      directions: (r[5] ?? "").trim(),
    });
  }

  const students = await prisma.student.findMany({
    select: { id: true, firstName: true, lastName: true, studentNumber: true, isActive: true },
  });

  console.log(`В файле строк: ${rows.length} (ходят ${rows.filter((r) => r.active).length}, не ходят ${rows.filter((r) => !r.active).length})`);
  console.log(`В базе учеников: ${students.length} (активных ${students.filter((s) => s.isActive).length})\n`);

  const byNum = new Map(students.filter((s) => s.studentNumber != null).map((s) => [s.studentNumber!, s]));
  const byName = new Map(students.map((s) => [norm(`${s.lastName} ${s.firstName}`), s]));

  const matchedIds = new Set<string>();
  const newOnes: Row[] = [];
  const numberMismatch: { row: Row; dbName: string }[] = [];
  const toDeactivate: { row: Row; id: string }[] = [];
  const toActivate: { row: Row; id: string }[] = [];
  const noAbbr: Row[] = [];

  for (const row of rows) {
    const fileName = norm(`${row.lastName} ${row.firstName}`);
    const byNumber = row.num != null ? byNum.get(row.num) : undefined;
    const byNameHit = byName.get(fileName);
    const hit = byNumber ?? byNameHit;

    if (!hit) {
      newOnes.push(row);
      continue;
    }
    matchedIds.add(hit.id);

    // номер занят другим человеком — важно, иначе перепутаем детей
    if (byNumber && norm(`${byNumber.lastName} ${byNumber.firstName}`) !== fileName) {
      numberMismatch.push({ row, dbName: `${byNumber.lastName} ${byNumber.firstName}` });
    }
    if (!row.active && hit.isActive) toDeactivate.push({ row, id: hit.id });
    if (row.active && !hit.isActive) toActivate.push({ row, id: hit.id });
    if (!row.abbr) noAbbr.push(row);
  }

  const notInFile = students.filter((s) => s.isActive && !matchedIds.has(s.id));

  const show = (title: string, list: string[]) => {
    console.log(`${title}: ${list.length}`);
    for (const l of list.slice(0, 40)) console.log(`   ${l}`);
    if (list.length > 40) console.log(`   … ещё ${list.length - 40}`);
    console.log();
  };

  show("НОВЫЕ — есть в файле, нет в базе", newOnes.map((r) => `#${r.num ?? "?"} ${r.lastName} ${r.firstName}${r.abbr ? ` (${r.abbr})` : ""}${r.active ? "" : " — не ходит"}`));
  show("ОТМЕТИТЬ «не ходит» — в файле 0, в базе активен", toDeactivate.map((x) => `#${x.row.num} ${x.row.lastName} ${x.row.firstName}`));
  show("ВЕРНУТЬ в активные — в файле 1, в базе неактивен", toActivate.map((x) => `#${x.row.num} ${x.row.lastName} ${x.row.firstName}`));
  show("⚠ НОМЕР ЗАНЯТ ДРУГИМ — в файле один человек, в базе под этим номером другой", numberMismatch.map((x) => `#${x.row.num}: файл «${x.row.lastName} ${x.row.firstName}» ≠ база «${x.dbName}»`));
  show("АКТИВНЫ В БАЗЕ, НО ИХ НЕТ В ФАЙЛЕ", notInFile.map((s) => `#${s.studentNumber ?? "?"} ${s.lastName} ${s.firstName}`));
  show("БЕЗ СОКРАЩЕНИЯ «В расписании»", noAbbr.map((r) => `#${r.num} ${r.lastName} ${r.firstName}`));

  const dupAbbr = new Map<string, Row[]>();
  for (const r of rows.filter((r) => r.abbr)) {
    const k = norm(r.abbr);
    dupAbbr.set(k, [...(dupAbbr.get(k) ?? []), r]);
  }
  show("⚠ ОДИНАКОВЫЕ СОКРАЩЕНИЯ у разных детей", [...dupAbbr.entries()].filter(([, l]) => l.length > 1).map(([k, l]) => `${k}: ${l.map((r) => `#${r.num} ${r.lastName} ${r.firstName}`).join(" | ")}`));

  console.log(`ИТОГО к применению: создать ${newOnes.length}, деактивировать ${toDeactivate.length}, вернуть ${toActivate.length}, сокращений для импорта ${rows.filter((r) => r.abbr).length}`);
  await prisma.$disconnect();
}

main();
