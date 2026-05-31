// Прогон парсера импорта v2 на реальном Excel-файле Дархана
// Запуск: npx tsx scripts/test-import.ts ~/Downloads/"Апрель 2026.xlsx"

import * as XLSX from "xlsx";
import { detectFormat, matchGridV2 } from "../src/lib/import-utils";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: npx tsx scripts/test-import.ts <path-to-xlsx>");
  process.exit(1);
}

const wb = XLSX.readFile(filePath);

for (const sheetName of wb.SheetNames) {
  const ws = wb.Sheets[sheetName];
  // Преобразуем в grid (массив массивов строк), сохраняя пустые ячейки
  const grid: string[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
    raw: false,
  }) as string[][];

  // Нормализация — все ячейки в строки
  const normalized = grid.map((row) =>
    row.map((cell) => (cell == null ? "" : String(cell)))
  );

  const format = detectFormat(normalized);
  console.log("\n=================================================");
  console.log(`ЛИСТ: "${sheetName}"`);
  console.log(`Размер: ${normalized.length} строк`);
  console.log(`Формат: ${format}`);
  console.log("=================================================");

  if (format !== "v2-multiblock") {
    console.log("(пропущено — не v2)");
    continue;
  }

  // Минимальные пустые stubs для словарей — парсер будет помечать "не найден"
  const teachers: any[] = [];
  const students: any[] = [];
  const groups: any[] = [];

  const preview = matchGridV2(normalized, teachers, students, groups);

  console.log(`\n  Блоков найдено: ${preview.blocksDetected}`);
  console.log(`  Педагогов: ${preview.teachersDetected.length}`);
  preview.teachersDetected.forEach((t) => console.log(`    - ${t}`));
  console.log(`\n  Всего ячеек: ${preview.totalRows}`);
  console.log(`  Валидных: ${preview.validRows}`);
  console.log(`  С ошибками: ${preview.errorRows}`);

  // Сводка по типам ячеек
  const byType: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const m of preview.matches) {
    const t = m.lessonType || "?";
    byType[t] = (byType[t] || 0) + 1;
    const c = m.lessonCategory || "—";
    byCategory[c] = (byCategory[c] || 0) + 1;
  }
  console.log(`\n  По типам:`, byType);
  console.log(`  По категориям:`, byCategory);

  // Список уникальных ошибок и их частоты
  const errFreq: Record<string, number> = {};
  for (const m of preview.matches) {
    for (const e of m.errors) {
      // Обрезаем имя из ошибки для группировки
      const key = e.replace(/«[^»]+»/g, "«...»").replace(/"[^"]+"/g, '"..."');
      errFreq[key] = (errFreq[key] || 0) + 1;
    }
  }
  const sortedErrs = Object.entries(errFreq).sort((a, b) => b[1] - a[1]);
  console.log(`\n  ТОП ошибок (всего уникальных: ${sortedErrs.length}):`);
  sortedErrs.slice(0, 15).forEach(([err, count]) => {
    console.log(`    [${count}x] ${err}`);
  });

  // Примеры распознанных ячеек с днями (для проверки day overrides)
  console.log(`\n  ПРИМЕРЫ распознанных ячеек с переопределением дней:`);
  let dayOverrideExamples = 0;
  for (const m of preview.matches) {
    if (dayOverrideExamples >= 10) break;
    const raw = (m as any).cell?.cellValue || "";
    if (
      raw.match(/\b(пн|вт|ср|чт|пт)\b/i) &&
      !raw.toLowerCase().includes("сопр")
    ) {
      console.log(
        `    "${raw}" → teacher=${m.teacherLabel ?? "?"} student=${m.studentOrGroupLabel ?? "?"} type=${m.lessonType ?? "?"}`
      );
      dayOverrideExamples++;
    }
  }
}
