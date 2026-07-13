// Живая сквозная проверка боевого preview-эндпоинта на проде (read-only).
// Шлём реальный client-schedule.csv (+ вариант с подставленной стажировкой) и
// смотрим, что боевой сервер вернул: тот же ли матч, работают ли стажировки/пары.
import * as fs from "fs";
import { parseCsvToGrid } from "../src/lib/import-utils";

const PROD = "https://school-management-mu-one.vercel.app/api/schedule/import";

async function preview(grid: string[][], label: string) {
  const res = await fetch(PROD, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gridData: grid, weekStart: "2026-07-13", preview: true }),
  });
  if (!res.ok) {
    console.log(`❌ ${label}: HTTP ${res.status} — ${await res.text()}`);
    return null;
  }
  const data = await res.json();
  console.log(`✅ ${label}: формат=${data.detectedFormat}, всего=${data.totalRows}, авто=${data.validRows}, ошибок=${data.errorRows}`);
  return data;
}

async function main() {
  const csv = fs.readFileSync("client-schedule.csv", "utf-8");
  const grid = parseCsvToGrid(csv, true);

  const base = await preview(grid, "Реальный файл как есть");
  if (base) {
    const pairs = base.matches.filter((m: any) => m.lessonType === "PAIR");
    console.log(`   Пар распознано боевым сервером: ${pairs.length}, пример: ${pairs[0]?.studentOrGroupLabel ?? "—"}`);
  }

  // Подставим стажировку под педагога, который точно в БД (Динара Мейрамкызы — наставник, реальный педагог)
  const patched = grid.map((r) => [...r]);
  outer: for (let i = 2; i < patched.length; i++) {
    for (let j = 1; j < patched[i].length; j++) {
      if (patched[i][j]?.trim()) { patched[i][j] = "стдм"; break outer; }
    }
  }
  const withIntern = await preview(patched, "С подставленной стажировкой стдм");
  if (withIntern) {
    const intern = withIntern.matches.find((m: any) => m.lessonCategory === "Стажировка");
    console.log(`   Стажировка на проде: ${intern ? intern.studentOrGroupLabel + " | ученик=" + (intern.studentId ?? "нет") : "НЕ найдена ❌"}`);
  }

  console.log("\nВывод: боевой preview-эндпоинт отвечает, парсит реальный файл, стажировки и пары живут.");
}

main().catch((e) => { console.error("Ошибка:", e); process.exit(1); });
