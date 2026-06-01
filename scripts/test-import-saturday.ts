// Прогон парсера v3 (суббота) на реальном файле Дархана.
// Запуск: npx tsx scripts/test-import-saturday.ts [путь] [имя_листа]

import * as XLSX from "xlsx";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { detectFormat, matchGridV2 } from "../src/lib/import-utils";

dotenv.config();

const filePath =
  process.argv[2] ?? `${process.env.HOME}/Downloads/Расписание на субботу (1) (1).xlsx`;
const onlySheet = process.argv[3];

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [teachers, students, groups] = await Promise.all([
    prisma.teacher.findMany({
      select: { id: true, lastName: true, firstName: true, patronymic: true },
    }),
    prisma.student.findMany({ select: { id: true, lastName: true, firstName: true } }),
    prisma.group.findMany({ select: { id: true, name: true, teacherId: true } }),
  ]);

  console.log(`БД: ${teachers.length} педагогов / ${students.length} учеников / ${groups.length} групп\n`);

  const wb = XLSX.readFile(filePath);
  const sheetsToTest = onlySheet
    ? [onlySheet]
    : ["16.05", "24.05", "25.04", "11.04 ", "01.11", "10.01"];

  const aggregate = {
    total: 0,
    matched: 0,
    unknownTeachers: new Set<string>(),
    unknownStudents: new Set<string>(),
  };

  for (const sheetName of sheetsToTest) {
    if (!wb.SheetNames.includes(sheetName)) {
      console.log(`Лист "${sheetName}" не найден`);
      continue;
    }
    const ws = wb.Sheets[sheetName];
    const grid: any[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
      raw: false,
    }) as any[][];
    const normalized = grid.map((row) => row.map((c) => (c == null ? "" : String(c))));

    const fmt = detectFormat(normalized);
    console.log(`\n=== "${sheetName}" → формат ${fmt} ===`);

    if (fmt !== "v3-saturday") {
      console.log("(пропуск — не v3)");
      continue;
    }

    const preview = matchGridV2(normalized, teachers, students, groups, fmt);
    console.log(`  Педагогов в листе: ${preview.teachersDetected.length}`);
    console.log(`  Ячеек к импорту: ${preview.totalRows}`);
    console.log(`  ✓ Полностью сматчилось: ${preview.validRows}`);
    console.log(`  ✗ С ошибками: ${preview.errorRows}`);

    aggregate.total += preview.totalRows;
    aggregate.matched += preview.validRows;

    for (const m of preview.matches) {
      if (!m.teacherId) aggregate.unknownTeachers.add(m.cell.teacherName);
      for (const e of m.errors) {
        if (e.startsWith("Не найден:")) {
          aggregate.unknownStudents.add(e.replace(/^Не найден:\s*"/, "").replace(/"$/, ""));
        }
      }
    }

    // Пример валидных
    const validSample = preview.matches.filter((m) => m.errors.length === 0).slice(0, 5);
    if (validSample.length > 0) {
      console.log(`  Примеры валидных:`);
      for (const m of validSample) {
        console.log(`    "${m.cell.cellValue}" → ${m.teacherLabel} / ${m.studentOrGroupLabel}`);
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(
    `ИТОГО: ${aggregate.matched}/${aggregate.total} = ${aggregate.total ? ((aggregate.matched / aggregate.total) * 100).toFixed(1) : 0}%`,
  );
  console.log(`\nНенайденных сокращений педагогов: ${aggregate.unknownTeachers.size}`);
  [...aggregate.unknownTeachers].sort().forEach((t) => console.log(`  - ${t}`));
  console.log(`\nНенайденных учеников: ${aggregate.unknownStudents.size}`);
  [...aggregate.unknownStudents].sort().slice(0, 30).forEach((s) => console.log(`  - ${s}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
