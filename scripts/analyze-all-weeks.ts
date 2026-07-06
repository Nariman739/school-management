// Прогон парсера импорта v2 по ВСЕМ пригодным листам в /tmp/darkhan-list.xlsx.
// Отчёт сохраняется в /tmp/import-diagnostics.txt.
//
// Задача: понять что реально ломает импорт сейчас (какие ученики/учителя/группы
// не находятся), не трогая сам парсер.
//
// Запуск: npx tsx scripts/analyze-all-weeks.ts
//
// Опционально можно передать путь: npx tsx scripts/analyze-all-weeks.ts /path/to/file.xlsx

import * as fs from "node:fs";
import * as XLSX from "xlsx";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { detectFormat, matchGridV2 } from "../src/lib/import-utils";

dotenv.config();

const INPUT_PATH = process.argv[2] || "/tmp/darkhan-list.xlsx";
const OUTPUT_PATH = "/tmp/import-diagnostics.txt";

// Листы, которые заведомо НЕ содержат недельного расписания (списки/пустые/легенда).
// Всё остальное пробуем прогнать через parser — если detectFormat вернёт "v1-simple"
// и валидных строк 0, всё равно покажем в отчёте.
const SKIP_SHEETS = new Set([
  "Список детей",
  "Список педагогов",
  "Список учеников",
]);

interface SheetReport {
  sheetName: string;
  detectedFormat: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  percentValid: number;
  errorsByCategory: Map<string, number>;
  // ключ = «нормализованная строка ячейки» → пример + счётчик
  uniqueUnresolved: Map<string, { count: number; teachers: Set<string> }>;
  skipped?: string; // причина пропуска
}

function classifyError(err: string): "Учитель не найден" | "Ученик/группа не найдены" | "Группа не найдена" | "Иное" {
  if (err.startsWith("Учитель не найден")) return "Учитель не найден";
  if (err.startsWith("Группа не найдена")) return "Группа не найдена";
  if (err.startsWith("Не найден")) return "Ученик/группа не найдены";
  return "Иное";
}

function normalizeCellForKey(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

async function main() {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  push("=".repeat(72));
  push("ДИАГНОСТИКА ИМПОРТА РАСПИСАНИЯ — analyze-all-weeks");
  push(`Дата запуска: ${new Date().toISOString()}`);
  push(`Файл: ${INPUT_PATH}`);
  push("=".repeat(72));
  push();

  if (!fs.existsSync(INPUT_PATH)) {
    push(`ОШИБКА: файл не найден: ${INPUT_PATH}`);
    fs.writeFileSync(OUTPUT_PATH, lines.join("\n"));
    console.error(`Файл не найден: ${INPUT_PATH}`);
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
  });

  try {
    const [teachers, students, groups] = await Promise.all([
      prisma.teacher.findMany({ where: { isActive: true } }),
      prisma.student.findMany({ where: { isActive: true } }),
      prisma.group.findMany(),
    ]);

    push(`БД: ${teachers.length} педагогов, ${students.length} учеников, ${groups.length} групп`);
    push();

    const wb = XLSX.readFile(INPUT_PATH);
    push(`Листы в файле (${wb.SheetNames.length}): ${wb.SheetNames.join(", ")}`);
    push();

    const reports: SheetReport[] = [];

    for (const sheetName of wb.SheetNames) {
      if (SKIP_SHEETS.has(sheetName)) {
        reports.push({
          sheetName,
          detectedFormat: "—",
          totalRows: 0,
          validRows: 0,
          errorRows: 0,
          percentValid: 0,
          errorsByCategory: new Map(),
          uniqueUnresolved: new Map(),
          skipped: "справочник (не расписание)",
        });
        continue;
      }

      const ws = wb.Sheets[sheetName];
      if (!ws) continue;

      const rawGrid: unknown[][] = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: "",
        raw: false,
      }) as unknown[][];
      const grid: string[][] = rawGrid.map((row) =>
        row.map((c) => (c == null ? "" : String(c))),
      );

      const fmt = detectFormat(grid);

      // Прогоняем всё — даже v1-simple (v3-saturday тоже поддерживается парсером).
      const preview = matchGridV2(grid, teachers, students, groups, fmt);

      const errorsByCategory = new Map<string, number>();
      const uniqueUnresolved = new Map<string, { count: number; teachers: Set<string> }>();

      for (const m of preview.matches) {
        for (const e of m.errors) {
          const cat = classifyError(e);
          errorsByCategory.set(cat, (errorsByCategory.get(cat) ?? 0) + 1);
        }

        // Уникальные «ненайденные ученики/группы» — самое ценное для точечной чистки.
        const hasStudentErr = m.errors.some(
          (e) => e.startsWith("Не найден") || e.startsWith("Группа не найдена"),
        );
        if (hasStudentErr) {
          const key = normalizeCellForKey(m.cell.cellValue);
          const entry = uniqueUnresolved.get(key) ?? { count: 0, teachers: new Set<string>() };
          entry.count++;
          entry.teachers.add(m.cell.teacherName);
          uniqueUnresolved.set(key, entry);
        }
      }

      const percentValid =
        preview.totalRows > 0
          ? (preview.validRows / preview.totalRows) * 100
          : 0;

      reports.push({
        sheetName,
        detectedFormat: fmt,
        totalRows: preview.totalRows,
        validRows: preview.validRows,
        errorRows: preview.errorRows,
        percentValid,
        errorsByCategory,
        uniqueUnresolved,
      });
    }

    // === Отчёт по каждому листу ===
    push("─".repeat(72));
    push("ПО ЛИСТАМ");
    push("─".repeat(72));
    push();

    for (const r of reports) {
      push(`### Лист: "${r.sheetName}"`);
      if (r.skipped) {
        push(`   Пропущено: ${r.skipped}`);
        push();
        continue;
      }
      push(`   Формат: ${r.detectedFormat}`);
      push(
        `   Всего ячеек: ${r.totalRows} | ` +
          `Валидных: ${r.validRows} (${r.percentValid.toFixed(1)}%) | ` +
          `С ошибками: ${r.errorRows}`,
      );
      if (r.errorsByCategory.size > 0) {
        push(`   Ошибки по категориям:`);
        for (const [cat, count] of [...r.errorsByCategory].sort((a, b) => b[1] - a[1])) {
          push(`     [${count.toString().padStart(3)}] ${cat}`);
        }
      }
      push();
    }

    // === Сводный отчёт ===
    push("─".repeat(72));
    push("СВОДКА ПО ВСЕМ ЛИСТАМ");
    push("─".repeat(72));
    push();

    const active = reports.filter((r) => !r.skipped);
    const totalCells = active.reduce((s, r) => s + r.totalRows, 0);
    const totalValid = active.reduce((s, r) => s + r.validRows, 0);
    const totalErrors = active.reduce((s, r) => s + r.errorRows, 0);
    const pct = totalCells > 0 ? (totalValid / totalCells) * 100 : 0;

    push(`Проанализировано листов: ${active.length}`);
    push(`Всего ячеек: ${totalCells}`);
    push(`Валидных: ${totalValid} (${pct.toFixed(1)}%)`);
    push(`С ошибками: ${totalErrors}`);
    push();

    // Агрегируем ошибки по категориям
    const totalByCategory = new Map<string, number>();
    for (const r of active) {
      for (const [cat, count] of r.errorsByCategory) {
        totalByCategory.set(cat, (totalByCategory.get(cat) ?? 0) + count);
      }
    }
    if (totalByCategory.size > 0) {
      push(`Ошибки по категориям (все листы):`);
      for (const [cat, count] of [...totalByCategory].sort((a, b) => b[1] - a[1])) {
        push(`  [${count.toString().padStart(4)}] ${cat}`);
      }
      push();
    }

    // === Топ-10 уникальных ненайденных ячеек ===
    push("─".repeat(72));
    push("ТОП-10 УНИКАЛЬНЫХ НЕНАЙДЕННЫХ УЧЕНИКОВ/ГРУПП (по всем листам)");
    push("─".repeat(72));
    push();
    push("Показывается: [сколько раз встретилось] «оригинальное значение ячейки» — учителя, в чьих колонках оно попадалось");
    push();

    const globalUnresolved = new Map<
      string,
      { count: number; teachers: Set<string>; example: string }
    >();
    for (const r of active) {
      for (const [key, entry] of r.uniqueUnresolved) {
        const g = globalUnresolved.get(key) ?? { count: 0, teachers: new Set(), example: key };
        g.count += entry.count;
        for (const t of entry.teachers) g.teachers.add(t);
        globalUnresolved.set(key, g);
      }
    }

    const sorted = [...globalUnresolved.entries()].sort((a, b) => b[1].count - a[1].count);
    const top = sorted.slice(0, 10);

    if (top.length === 0) {
      push("  (нет ненайденных — импорт полностью совпадает с БД)");
    } else {
      top.forEach(([, entry], i) => {
        const teachersList = [...entry.teachers].slice(0, 4).join(", ");
        const more = entry.teachers.size > 4 ? ` +${entry.teachers.size - 4}` : "";
        push(
          `  ${(i + 1).toString().padStart(2)}. [${entry.count.toString().padStart(3)}] «${entry.example}»`,
        );
        push(`         учителя: ${teachersList}${more}`);
      });
    }
    push();

    // === Полный список уникальных ненайденных (для последующей чистки) ===
    push("─".repeat(72));
    push(`ПОЛНЫЙ СПИСОК УНИКАЛЬНЫХ НЕНАЙДЕННЫХ (${sorted.length} шт.)`);
    push("─".repeat(72));
    push();
    for (const [, entry] of sorted) {
      push(`  [${entry.count.toString().padStart(3)}] «${entry.example}»`);
    }
    push();

    push("=".repeat(72));
    push("КОНЕЦ ОТЧЁТА");
    push("=".repeat(72));

    fs.writeFileSync(OUTPUT_PATH, lines.join("\n"));
    console.log(`Отчёт сохранён: ${OUTPUT_PATH}`);
    console.log();
    console.log(`Проанализировано листов: ${active.length}`);
    console.log(`Валидных: ${totalValid}/${totalCells} (${pct.toFixed(1)}%)`);
    console.log(`Уникальных ненайденных: ${sorted.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
