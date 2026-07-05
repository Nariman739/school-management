// Обогащает ВСЕ листы xlsx-файла Дархана, сохраняя структуру.
// В каждой ячейке где однозначно распознан ученик — проставляется ID.
//
// Запуск: npx tsx scripts/enrich-full-file.ts <input.xlsx> [output.xlsx]

import * as XLSX from "xlsx";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { parseCellValueV2 } from "../src/lib/import-utils";

dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

function findStudentCandidates(name: string, students: { studentNumber: number | null; firstName: string; lastName: string }[]) {
  const n = name.trim().toLowerCase();
  if (!n) return [];
  const byFirst = students.filter((s) => s.firstName.toLowerCase() === n);
  if (byFirst.length > 0) return byFirst;
  const byLast = students.filter((s) => s.lastName.toLowerCase() === n);
  if (byLast.length > 0) return byLast;
  const fused = name.match(/^([А-ЯЁ][а-яё]+)([А-ЯЁ])$/);
  if (fused) {
    const [, first, initial] = fused;
    return students.filter((s) => s.firstName.toLowerCase() === first.toLowerCase() && s.lastName.toLowerCase().startsWith(initial.toLowerCase()));
  }
  return [];
}

function enrichCell(cell: string, students: any[]): { newCell: string; enriched: boolean; ambiguous: boolean; mismatch: boolean } {
  if (!cell) return { newCell: cell, enriched: false, ambiguous: false, mismatch: false };

  // Пропускаем шапки и служебное
  if (/№\s*\d/i.test(cell)) return { newCell: cell, enriched: false, ambiguous: false, mismatch: false };
  if (/(евна|овна|ович|евич|кызы|қызы|улы|ұлы)\b/i.test(cell)) return { newCell: cell, enriched: false, ambiguous: false, mismatch: false };
  if (/^\d{1,2}[.:]\d{2}$/.test(cell) || /^\d{1,2}$/.test(cell)) return { newCell: cell, enriched: false, ambiguous: false, mismatch: false };
  if (/^(пн|вт|ср|чт|пт|сб)(\s+(пн|вт|ср|чт|пт|сб))+$/i.test(cell)) return { newCell: cell, enriched: false, ambiguous: false, mismatch: false };

  const parsed = parseCellValueV2(cell);
  if (parsed.type !== "student" || parsed.names.length === 0) return { newCell: cell, enriched: false, ambiguous: false, mismatch: false };
  const studentName = parsed.names[0];

  // Уже есть ID?
  const existingIdMatch = cell.match(/\b(0\d{2}|\d{3})\b/) ?? cell.match(/^([А-ЯЁ][а-яё]+)\s+(\d{1,3})\b/);
  if (existingIdMatch) {
    const existingId = parseInt(existingIdMatch[existingIdMatch.length - 1], 10);
    const byId = students.find((s) => s.studentNumber === existingId);
    const nameLower = studentName.toLowerCase().replace(/\d+/g, "").trim();
    if (byId && nameLower && !byId.firstName.toLowerCase().startsWith(nameLower) && !nameLower.startsWith(byId.firstName.toLowerCase())) {
      return { newCell: `${cell} [!имя≠#${existingId}=${byId.firstName}]`, enriched: false, ambiguous: false, mismatch: true };
    }
    return { newCell: cell, enriched: false, ambiguous: false, mismatch: false };
  }

  const candidates = findStudentCandidates(studentName, students);
  if (candidates.length === 1) {
    const id = candidates[0].studentNumber!.toString().padStart(3, "0");
    return { newCell: cell.replace(studentName, `${studentName} ${id}`), enriched: true, ambiguous: false, mismatch: false };
  }
  if (candidates.length > 1) {
    return { newCell: `${cell} [?${candidates.length}]`, enriched: false, ambiguous: true, mismatch: false };
  }
  return { newCell: cell, enriched: false, ambiguous: false, mismatch: false };
}

async function main() {
  const inPath = process.argv[2];
  const outPath = process.argv[3] ?? inPath.replace(/\.xlsx$/, "-обогащённый.xlsx");
  if (!inPath) { console.error("Usage: <in.xlsx> [out.xlsx]"); process.exit(1); }

  const students = await prisma.student.findMany({
    where: { isActive: true, studentNumber: { not: null } },
    select: { studentNumber: true, firstName: true, lastName: true },
  });
  console.log(`БД: ${students.length} учеников с ID\n`);

  const wb = XLSX.readFile(inPath);
  const newWb = XLSX.utils.book_new();

  let totalEnriched = 0, totalAmbiguous = 0, totalMismatch = 0;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }) as any[][];

    let sheetEnriched = 0, sheetAmbiguous = 0, sheetMismatch = 0;
    const out: string[][] = grid.map((row) =>
      row.map((cellRaw) => {
        const cell = String(cellRaw ?? "").trim();
        const r = enrichCell(cell, students);
        if (r.enriched) sheetEnriched++;
        if (r.ambiguous) sheetAmbiguous++;
        if (r.mismatch) sheetMismatch++;
        return r.newCell;
      }),
    );

    console.log(`  [${sheetName}] обогащено: ${sheetEnriched}, неоднозначно: ${sheetAmbiguous}, ошибки Дархана: ${sheetMismatch}`);
    totalEnriched += sheetEnriched;
    totalAmbiguous += sheetAmbiguous;
    totalMismatch += sheetMismatch;

    const newSheet = XLSX.utils.aoa_to_sheet(out);
    XLSX.utils.book_append_sheet(newWb, newSheet, sheetName);
  }

  console.log(`\n=== ИТОГО ===`);
  console.log(`  Обогащено ID: ${totalEnriched}`);
  console.log(`  Неоднозначно (нужно решить): ${totalAmbiguous}`);
  console.log(`  Ошибки в исходном файле: ${totalMismatch}`);

  XLSX.writeFile(newWb, outPath);
  console.log(`\n✓ Файл сохранён: ${outPath}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
