import * as XLSX from "xlsx";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { detectFormat, matchGridV2 } from "../src/lib/import-utils";

dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const [teachers, students, groups] = await Promise.all([
    prisma.teacher.findMany({ where: { isActive: true } }),
    prisma.student.findMany({ where: { isActive: true } }),
    prisma.group.findMany(),
  ]);
  console.log(`БД: ${teachers.length} педагогов, ${students.length} учеников, ${groups.length} групп\n`);

  const wb = XLSX.readFile("/tmp/darkhan-list.xlsx");
  for (const sheetName of ["8-12.06", "13.06"]) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }) as any[][];
    const normalized = grid.map((row) => row.map((c) => (c == null ? "" : String(c))));
    const fmt = detectFormat(normalized);
    console.log(`\n=== "${sheetName}" (${fmt}) ===`);
    const p = matchGridV2(normalized, teachers, students, groups, fmt);
    console.log(`  Всего: ${p.totalRows} | Валидных: ${p.validRows} | С ошибками: ${p.errorRows} = ${((p.validRows/p.totalRows)*100).toFixed(1)}%`);

    // Топ ошибок
    const errFreq = new Map<string, number>();
    const errCells: Record<string, string[]> = {};
    for (const m of p.matches) {
      for (const e of m.errors) {
        const key = e.startsWith("Учитель") ? "Учитель не найден" :
                    e.startsWith("Не найден") ? "Ученик/группа не найдены" :
                    e.startsWith("Группа") ? "Группа не найдена" : e;
        errFreq.set(key, (errFreq.get(key) || 0) + 1);
        if (!errCells[key]) errCells[key] = [];
        if (errCells[key].length < 20) errCells[key].push(m.cell.cellValue + " | учитель=" + m.cell.teacherName);
      }
    }
    for (const [key, count] of [...errFreq].sort((a, b) => b[1] - a[1])) {
      console.log(`  [${count}] ${key}`);
      for (const c of errCells[key].slice(0, 8)) console.log(`      "${c}"`);
    }
  }
}
main().finally(() => prisma.$disconnect());
