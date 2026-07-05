import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

// Копируем matchTeacherByAbbr сюда через "internal test" — вызовем через реальный парсер
import * as XLSX from "xlsx";
import { detectFormat, matchGridV2 } from "../src/lib/import-utils";

async function main() {
  const [teachers, students, groups] = await Promise.all([
    prisma.teacher.findMany({ where: { isActive: true } }),
    prisma.student.findMany({ where: { isActive: true } }),
    prisma.group.findMany(),
  ]);

  const wb = XLSX.readFile("/tmp/darkhan-list.xlsx");
  const ws = wb.Sheets["13.06"];
  const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }) as any[][];
  const normalized = grid.map((row) => row.map((c) => (c == null ? "" : String(c))));

  console.log("Заголовки колонок (row 0):", normalized[0]);

  const preview = matchGridV2(normalized, teachers, students, groups, "v3-saturday");
  console.log(`\nВалидных: ${preview.validRows}/${preview.totalRows}`);
  console.log("Педагоги detected:", preview.teachersDetected);

  // Все errors уникальные
  const errsFor = new Map<string, string[]>();
  for (const m of preview.matches) {
    for (const e of m.errors) {
      if (!errsFor.has(m.cell.teacherName)) errsFor.set(m.cell.teacherName, []);
      const list = errsFor.get(m.cell.teacherName)!;
      if (list.length < 3) list.push(`"${m.cell.cellValue}" → ${e}`);
    }
  }
  for (const [teacher, errs] of errsFor) {
    console.log(`\n[учитель "${teacher}"]:`);
    for (const e of errs) console.log(`  ${e}`);
  }
}
main().finally(() => prisma.$disconnect());
