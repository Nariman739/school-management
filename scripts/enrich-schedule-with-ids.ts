// Читает файл-шаблон расписания Дархана и генерирует НОВЫЙ xlsx где в каждой
// ячейке рядом с именем ученика проставлен его ID из БД.
// Так Дархан получает готовый шаблон где вместо «Асанали» стоит «Асанали 044»,
// вместо «Мансура» — «Мансура 079», и т.д.
//
// Логика:
// - Если однозначно сматчилось (1 кандидат по имени) — ставим ID.
// - Если несколько кандидатов — оставляем оригинал + [?].
// - Если 0 кандидатов — оставляем как есть.
//
// Запуск: npx tsx scripts/enrich-schedule-with-ids.ts <xlsx> <sheet_name> [output.xlsx]

import * as XLSX from "xlsx";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { parseCellValueV2 } from "../src/lib/import-utils";

dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

// Небольшой матчер имён учеников — возвращает ВСЕХ кандидатов
function findStudentCandidates(name: string, students: { studentNumber: number | null; firstName: string; lastName: string }[]) {
  const n = name.trim().toLowerCase();
  if (!n) return [];

  // 1) Точное имя
  const byFirst = students.filter((s) => s.firstName.toLowerCase() === n);
  if (byFirst.length > 0) return byFirst;

  // 2) Точная фамилия
  const byLast = students.filter((s) => s.lastName.toLowerCase() === n);
  if (byLast.length > 0) return byLast;

  // 3) «ИмяБ» — имя + буква фамилии слитно
  const fused = name.match(/^([А-ЯЁ][а-яё]+)([А-ЯЁ])$/);
  if (fused) {
    const [, first, initial] = fused;
    const cs = students.filter((s) =>
      s.firstName.toLowerCase() === first.toLowerCase() &&
      s.lastName.toLowerCase().startsWith(initial.toLowerCase()),
    );
    if (cs.length > 0) return cs;
  }

  return [];
}

async function main() {
  const filePath = process.argv[2];
  const sheetName = process.argv[3];
  const outPath = process.argv[4] ?? filePath.replace(/\.xlsx$/, "-with-ids.xlsx");

  if (!filePath || !sheetName) {
    console.error("Usage: npx tsx scripts/enrich-schedule-with-ids.ts <file.xlsx> <sheet> [out.xlsx]");
    process.exit(1);
  }

  const students = await prisma.student.findMany({
    where: { isActive: true, studentNumber: { not: null } },
    select: { studentNumber: true, firstName: true, lastName: true },
  });
  console.log(`БД: ${students.length} учеников с ID`);

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[sheetName];
  if (!ws) { console.error(`Лист "${sheetName}" не найден`); process.exit(1); }

  const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }) as any[][];

  let enriched = 0, ambiguous = 0, unknown = 0;
  const out: string[][] = [];

  for (const row of grid) {
    const newRow: string[] = [];
    for (const cellRaw of row) {
      const cell = String(cellRaw ?? "").trim();
      if (!cell) { newRow.push(cell); continue; }

      // Не-ученические ячейки: заголовки педагогов (отчества), кабинеты, время, дни
      if (/№\s*\d/i.test(cell)) { newRow.push(cell); continue; }
      if (/(евна|овна|ович|евич|кызы|қызы|улы|ұлы)\b/i.test(cell)) { newRow.push(cell); continue; }
      if (/^\d{1,2}[.:]\d{2}$/.test(cell) || /^\d{1,2}$/.test(cell)) { newRow.push(cell); continue; }
      if (/^(пн|вт|ср|чт|пт|сб)(\s+(пн|вт|ср|чт|пт|сб))+$/i.test(cell)) { newRow.push(cell); continue; }

      const parsed = parseCellValueV2(cell);
      if (parsed.type !== "student" || parsed.names.length === 0) {
        newRow.push(cell);
        continue;
      }

      const studentName = parsed.names[0];

      // Уже есть ID? ID = 3 цифры (обычно с ведущим нулём) или число прямо после имени
      // без цифры внутри имени. Иначе это возраст / номер группы / и т.д. — не ID.
      const existingIdMatch = cell.match(/\b(0\d{2}|\d{3})\b/) ?? cell.match(/^([А-ЯЁ][а-яё]+)\s+(\d{1,3})\b/);
      if (existingIdMatch) {
        const existingId = parseInt(existingIdMatch[1], 10);
        const byId = students.find((s) => s.studentNumber === existingId);
        // Если по ID нашли одного, но его имя не начинается с того что написано —
        // помечаем как «?ID_MISMATCH». Дархан увидит и исправит.
        const nameLower = studentName.toLowerCase().replace(/\d+/g, "").trim();
        if (byId && nameLower && !byId.firstName.toLowerCase().startsWith(nameLower) && !nameLower.startsWith(byId.firstName.toLowerCase())) {
          newRow.push(`${cell} [!имя≠#${existingId}=${byId.firstName}]`);
        } else {
          newRow.push(cell);
        }
        continue;
      }

      const candidates = findStudentCandidates(studentName, students);

      if (candidates.length === 1) {
        const s = candidates[0]!;
        const id = s.studentNumber!.toString().padStart(3, "0");
        // Ставим ID сразу после имени, перед категорией
        const replaced = cell.replace(studentName, `${studentName} ${id}`);
        newRow.push(replaced);
        enriched++;
      } else if (candidates.length > 1) {
        newRow.push(`${cell} [?${candidates.length}]`);
        ambiguous++;
      } else {
        newRow.push(cell);
        unknown++;
      }
    }
    out.push(newRow);
  }

  console.log(`\nЯчейки: обогащено ${enriched}, неоднозначно ${ambiguous}, не найдено ${unknown}`);

  const newSheet = XLSX.utils.aoa_to_sheet(out);
  const newWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(newWb, newSheet, sheetName);
  XLSX.writeFile(newWb, outPath);
  console.log(`\n✓ Сохранено: ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
