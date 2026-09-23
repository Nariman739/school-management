// Разбор присланного xlsx: какие листы, какие колонки, сколько строк.
// Запуск: npx tsx scripts/inspect-xlsx.ts <файл.xlsx> [строк]
import * as XLSX from "xlsx";

const file = process.argv[2];
const preview = Number(process.argv[3] ?? 8);

if (!file) {
  console.error("Укажите файл: npx tsx scripts/inspect-xlsx.ts <файл.xlsx>");
  process.exit(1);
}

const wb = XLSX.readFile(file);
console.log(`Файл: ${file}`);
console.log(`Листов: ${wb.SheetNames.length} — ${wb.SheetNames.join(", ")}\n`);

for (const name of wb.SheetNames) {
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][];
  const width = Math.max(0, ...rows.map((r) => r.length));
  const filled = rows.reduce((n, r) => n + r.filter((c) => c != null && String(c).trim() !== "").length, 0);
  console.log(`=== лист «${name}» — строк ${rows.length}, колонок ${width}, заполненных ячеек ${filled} ===`);
  for (const r of rows.slice(0, preview)) {
    console.log("   ", JSON.stringify(r).slice(0, 300));
  }
  if (rows.length > preview) console.log(`    … ещё ${rows.length - preview} строк`);
  console.log();
}
