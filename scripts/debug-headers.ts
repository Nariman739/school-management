// Отладочный скрипт: показывает почему заголовок отфильтровывается.
import * as XLSX from "xlsx";

const filePath = process.argv[2] ?? `${process.env.HOME}/Downloads/Апрель 2026.xlsx`;
const wb = XLSX.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }) as any[][];

const SERVICE_HEADERS = ["методисты", "время", "сопр", "мно", "комментарий", "примечание", "заметка"];

function classify(headerCell: string): { keep: boolean; reason: string } {
  if (!headerCell) return { keep: false, reason: "empty" };
  if (/^[гГ][рР]/i.test(headerCell) && headerCell.length <= 10) return { keep: false, reason: "starts with гр <=10" };
  if (headerCell.includes("\\") || headerCell.includes("/")) return { keep: false, reason: "has slash" };
  if (/^[а-яёА-ЯЁa-zA-Z\s]+$/.test(headerCell) && headerCell.length <= 6) return { keep: false, reason: "<=6 letters" };
  const headerLower = headerCell.toLowerCase();
  if (headerLower.includes("практикант") || headerLower.includes("стажер") || headerLower.includes("стажёр")) return { keep: false, reason: "praktikant" };
  if (SERVICE_HEADERS.some((s) => headerLower === s || headerLower.startsWith(s + " "))) return { keep: false, reason: "service header" };
  if (/[\d:]/.test(headerCell)) return { keep: false, reason: "has digit/colon" };
  const lettersOnly = headerCell.replace(/[^а-яёa-zА-ЯЁA-Z]/g, "");
  if (lettersOnly.length >= 3 && lettersOnly === lettersOnly.toUpperCase()) return { keep: false, reason: "ALL UPPERCASE" };
  const cleaned = headerCell.replace(/№[^\s]*\s*каб[^\s]*/gi, "").replace(/№\s*[\d\s+]+/g, "").trim();
  const hasSpec = /\s+(И\+А|И|А|ТЕХ)\s*$/i.test(cleaned);
  const hasMultipleWords = cleaned.split(/\s+/).filter(Boolean).length >= 2;
  const hasKzPatronymic = /(қызы|улы|ұлы|кызы)$/i.test(cleaned);
  if (!hasSpec && !hasMultipleWords && !hasKzPatronymic) {
    return { keep: false, reason: `no-spec & not-multi-word & no-kz: cleaned="${cleaned}"` };
  }
  if (/^(пн|вт|ср|чт|пт|сб|вс)([\s,]+(пн|вт|ср|чт|пт|сб|вс))+$/i.test(headerCell)) return { keep: false, reason: "days marker" };
  return { keep: true, reason: `OK (spec=${hasSpec}, multi=${hasMultipleWords}, kz=${hasKzPatronymic})` };
}

// Проверим row 1 (первый блок), row 16 (второй), row 31 (третий), row 45 (четвёртый), row 62 (пятый)
const rowsToCheck = [1, 16, 31, 45, 62];
for (const rIdx of rowsToCheck) {
  const row = grid[rIdx - 1] ?? [];
  console.log(`\n=== Строка ${rIdx} ===`);
  for (let c = 0; c < row.length; c++) {
    const cell = String(row[c] ?? "").trim();
    if (!cell) continue;
    const cls = classify(cell);
    const marker = cls.keep ? "✓" : "✗";
    console.log(`  ${marker} col ${c}: "${cell.slice(0, 50)}" → ${cls.reason}`);
  }
}
