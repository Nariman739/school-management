// Симуляция импорта расписания С УЧЁТОМ сокращений из «Список_детей обнов.xlsx».
// НИЧЕГО НЕ ПИШЕТ. Отвечает на вопрос: сколько встанет, если завести новых детей
// и сохранить сокращения как псевдонимы.
// Запуск: npx tsx scripts/simulate-import.ts <расписание.xlsx> <список_детей.xlsx>
import * as XLSX from "xlsx";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { detectFormat, matchGridV2, parseCellValueV2 } from "../src/lib/import-utils";

dotenv.config();
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, "").trim();

const readGrid = (file: string) => {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }) as unknown[][];
  return grid.map((row) => row.map((c) => (c == null ? "" : String(c))));
};

async function main() {
  const [scheduleFile, studentsFile] = process.argv.slice(2);

  // сокращение → «Фамилия Имя» из файла
  const wb = XLSX.readFile(studentsFile);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    blankrows: false,
    raw: false,
  }) as string[][];
  const abbrMap = new Map<string, { name: string; active: boolean; num: string }>();
  for (const r of rows.slice(1)) {
    const abbr = (r[4] ?? "").trim();
    if (!abbr) continue;
    abbrMap.set(norm(abbr), {
      name: `${(r[2] ?? "").trim()} ${(r[1] ?? "").trim()}`.trim(),
      active: String(r[3] ?? "").trim() !== "0",
      num: String(r[0] ?? "").trim(),
    });
  }

  const [teachers, students, groups] = await Promise.all([
    prisma.teacher.findMany({ where: { isActive: true } }),
    prisma.student.findMany({ where: { isActive: true } }),
    prisma.group.findMany(),
  ]);

  const grid = readGrid(scheduleFile);
  const format = detectFormat(grid);
  const result = matchGridV2(grid, teachers, students, groups, format);

  const bad = result.matches.filter((m) => m.errors.length > 0);
  const teacherProblems = bad.filter((m) => m.errors.some((e) => e.startsWith("Учитель не найден")));
  const studentProblems = bad.filter((m) => !m.errors.some((e) => e.startsWith("Учитель не найден")));

  console.log(`Формат: ${format}, ячеек: ${result.matches.length}`);
  console.log(`Сейчас встают: ${result.matches.length - bad.length} (${Math.round((1 - bad.length / result.matches.length) * 100)}%)`);
  console.log(`   не найден педагог: ${teacherProblems.length}`);
  console.log(`   не найден ученик/группа: ${studentProblems.length}\n`);

  const wouldFix: string[] = [];
  const stillBad = new Map<string, number>();
  const needCreate = new Map<string, string>();

  for (const m of studentProblems) {
    const cell = (m as { cell: { cellValue: string } }).cell.cellValue;
    const parsed = parseCellValueV2(cell);
    const name = parsed.names[0] ?? "";
    const hit = name ? abbrMap.get(norm(name)) : undefined;

    if (!hit) {
      stillBad.set(cell, (stillBad.get(cell) ?? 0) + 1);
      continue;
    }
    wouldFix.push(`${cell} → ${hit.name}`);
    const inDb = students.some(
      (s) => norm(`${s.lastName} ${s.firstName}`) === norm(hit.name)
    );
    if (!inDb) needCreate.set(hit.name, `#${hit.num}${hit.active ? "" : " (не ходит)"}`);
  }

  console.log(`Сокращения из файла закрывают: ${wouldFix.length} ячеек`);
  console.log(`   из них требуют завести ребёнка: ${[...needCreate].length} человек`);
  for (const [name, num] of [...needCreate].slice(0, 30)) console.log(`      ${num} ${name}`);

  const rest = [...stillBad.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\nОстанутся неразобранными: ${rest.reduce((n, [, c]) => n + c, 0)} ячеек, ${rest.length} разных значений`);
  for (const [cell, n] of rest.slice(0, 40)) console.log(`   «${cell}» ×${n}`);

  const after = result.matches.length - bad.length + wouldFix.length;
  console.log(`\nИТОГ: станет ${after} из ${result.matches.length} (${Math.round((after / result.matches.length) * 100)}%), педагоги отдельно: ${teacherProblems.length} ячеек`);

  await prisma.$disconnect();
}

main();
