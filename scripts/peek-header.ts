import * as XLSX from "xlsx";
const wb = XLSX.readFile(`${process.env.HOME}/Downloads/Апрель 2026.xlsx`);
const ws = wb.Sheets["30.03-03.04"];
const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }) as any[][];
const row1 = grid[0];
const cell = String(row1[3] ?? "").trim();
console.log("len:", cell.length);
console.log("repr:", JSON.stringify(cell));
for (let i = 0; i < cell.length; i++) {
  const c = cell[i];
  const code = cell.charCodeAt(i);
  if (/\d/.test(c) || c === ":" || code === 8470 || code > 127) {
    console.log(`  pos ${i}: "${c}" (U+${code.toString(16).padStart(4, "0")})`);
  }
}
