// Сквозная проверка на реальном CSV Дархана + реальной БД (только чтение).
// 1) процент распознавания на реальном файле (регрессия);
// 2) вживую подставляем "стрж" в первую занятую ячейку и смотрим слот-стажировку.
// Запуск: npx tsx scripts/test-internship-db.ts
import * as fs from "fs";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { parseCsvToGrid, detectFormat, matchGridV2 } from "../src/lib/import-utils";

dotenv.config();
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [teachers, students, groups] = await Promise.all([
    prisma.teacher.findMany({ select: { id: true, lastName: true, firstName: true, patronymic: true } }),
    prisma.student.findMany({ select: { id: true, lastName: true, firstName: true, studentNumber: true } }),
    prisma.group.findMany({ select: { id: true, name: true, teacherId: true } }),
  ]);
  console.log(`БД: ${teachers.length} педагогов / ${students.length} учеников / ${groups.length} групп`);

  const csv = fs.readFileSync("client-schedule.csv", "utf-8");
  const grid = parseCsvToGrid(csv, true);
  const format = detectFormat(grid);
  console.log(`Формат: ${format}\n`);

  const res = matchGridV2(grid, teachers, students, groups);
  const pct = ((res.validRows / res.totalRows) * 100).toFixed(1);
  console.log(`РЕАЛЬНЫЙ ФАЙЛ: ячеек ${res.totalRows}, сматчилось ${res.validRows} (${pct}%)`);
  const pairs = res.matches.filter((m) => m.lessonType === "PAIR");
  const pairsOk = pairs.filter((m) => m.errors.length === 0 && m.pairStudentIds?.length === 2);
  console.log(`Пар распознано: ${pairs.length}, из них с двумя id (импортируемых): ${pairsOk.length}`);
  if (pairsOk[0]) console.log(`  пример пары: ${pairsOk[0].studentOrGroupLabel}  ids=${pairsOk[0].pairStudentIds?.join(",")}`);

  // Подставляем "стрж" в занятые ячейки по очереди, пока не попадём под педагога,
  // который есть в БД (чтобы проверить стажировку на реально сматченном учителе).
  let intern: (typeof res.matches)[number] | undefined;
  outer: for (let i = 2; i < grid.length; i++) {
    for (let j = 1; j < grid[i].length; j++) {
      if (!grid[i][j]?.trim()) continue;
      const patched = grid.map((r) => [...r]);
      patched[i][j] = "стрж";
      const cand = matchGridV2(patched, teachers, students, groups)
        .matches.find((m) => m.lessonCategory === "Стажировка");
      if (cand?.teacherId) {
        intern = cand;
        console.log(`\nПодставил "стрж" под педагога "${cand.teacherLabel}" (строка ${i + 1}, колонка ${j + 1})`);
        break outer;
      }
    }
  }
  console.log("Слот-стажировка на реальном педагоге:");
  console.log(JSON.stringify({
    teacherLabel: intern?.teacherLabel,
    label: intern?.studentOrGroupLabel,
    lessonCategory: intern?.lessonCategory,
    lessonType: intern?.lessonType,
    studentId: intern?.studentId ?? null,
    errors: intern?.errors,
  }, null, 2));
  console.log(
    intern && intern.errors.length === 0 && !intern.studentId && intern.teacherId
      ? "✅ стажировка валидна: педагог найден, ученика нет, в оплату не пойдёт"
      : "❌ проблема со стажировкой на реальных данных"
  );
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
