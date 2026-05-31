// Прогон парсера импорта v2 на реальном Excel + реальной БД.
// Покажет: сколько ячеек распозналось, какие имена не сматчились,
// какие педагоги отсутствуют — это и есть рабочий список того что Дархан
// должен довести вручную.
//
// Запуск: npx tsx scripts/test-import-with-db.ts "/path/to/Апрель 2026.xlsx"

import * as XLSX from "xlsx";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { detectFormat, matchGridV2 } from "../src/lib/import-utils";

dotenv.config();

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: npx tsx scripts/test-import-with-db.ts <path-to-xlsx>");
  process.exit(1);
}

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [teachers, students, groups] = await Promise.all([
    prisma.teacher.findMany({ select: { id: true, lastName: true, firstName: true, patronymic: true } }),
    prisma.student.findMany({ select: { id: true, lastName: true, firstName: true } }),
    prisma.group.findMany({ select: { id: true, name: true, teacherId: true } }),
  ]);

  console.log(`БД: ${teachers.length} педагогов / ${students.length} учеников / ${groups.length} групп\n`);

  const wb = XLSX.readFile(filePath);
  const aggregateStats = {
    totalCells: 0,
    matchedCells: 0,
    unknownTeachers: new Set<string>(),
    unknownStudents: new Set<string>(),
    unknownGroups: new Set<string>(),
  };

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const grid: any[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
      raw: false,
    }) as any[][];
    const normalized = grid.map((row) => row.map((cell) => (cell == null ? "" : String(cell))));

    const format = detectFormat(normalized);
    if (format !== "v2-multiblock") {
      console.log(`Лист "${sheetName}": формат ${format}, пропуск`);
      continue;
    }

    const preview = matchGridV2(normalized, teachers, students, groups);

    const teacherKnown = preview.matches.filter((m) => !!m.teacherId).length;
    const teacherUnknown = preview.totalRows - teacherKnown;
    const fullyMatched = preview.validRows;

    console.log(`\nЛИСТ "${sheetName}":`);
    console.log(`  Блоков: ${preview.blocksDetected}, педагогов в листе: ${preview.teachersDetected.length}`);
    console.log(`  Ячеек к импорту: ${preview.totalRows}`);
    console.log(`  ✓ Полностью сматчилось: ${fullyMatched}`);
    console.log(`  · Педагог не найден: ${teacherUnknown}`);
    console.log(`  · Ученик/группа не найдены (но педагог есть): ${preview.errorRows - teacherUnknown}`);

    aggregateStats.totalCells += preview.totalRows;
    aggregateStats.matchedCells += fullyMatched;

    for (const m of preview.matches) {
      if (!m.teacherId) {
        aggregateStats.unknownTeachers.add(m.cell.teacherName);
      }
      for (const e of m.errors) {
        if (e.startsWith("Не найден:")) {
          const name = e.replace(/^Не найден:\s*"/, "").replace(/"$/, "");
          aggregateStats.unknownStudents.add(name);
        } else if (e.startsWith("Группа не найдена:")) {
          const name = e.replace(/^Группа не найдена:\s*"/, "").replace(/"$/, "");
          aggregateStats.unknownGroups.add(name);
        }
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`ИТОГО:`);
  console.log(`  Ячеек всего: ${aggregateStats.totalCells}`);
  console.log(`  Сматчилось: ${aggregateStats.matchedCells} (${((aggregateStats.matchedCells / aggregateStats.totalCells) * 100).toFixed(1)}%)`);
  console.log();
  console.log(`Уникальных НЕНАЙДЕННЫХ педагогов: ${aggregateStats.unknownTeachers.size}`);
  [...aggregateStats.unknownTeachers].sort().slice(0, 50).forEach((t) => console.log(`  - ${t}`));
  console.log();
  console.log(`Уникальных НЕНАЙДЕННЫХ учеников: ${aggregateStats.unknownStudents.size}`);
  [...aggregateStats.unknownStudents].sort().slice(0, 80).forEach((s) => console.log(`  - ${s}`));
  console.log();
  console.log(`Уникальных НЕНАЙДЕННЫХ групп: ${aggregateStats.unknownGroups.size}`);
  [...aggregateStats.unknownGroups].sort().forEach((g) => console.log(`  - ${g}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
