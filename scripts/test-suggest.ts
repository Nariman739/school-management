// Проверка подсказок «похоже это он?» на реальной БД.
// Берём нераспознанные имена из client-schedule.csv и смотрим, что предлагает fuzzy.
import * as fs from "fs";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { parseCsvToGrid, matchGridV2, suggestStudentMatches } from "../src/lib/import-utils";

dotenv.config();
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [teachers, students, groups] = await Promise.all([
    prisma.teacher.findMany({ select: { id: true, lastName: true, firstName: true, patronymic: true } }),
    prisma.student.findMany({ select: { id: true, lastName: true, firstName: true, studentNumber: true } }),
    prisma.group.findMany({ select: { id: true, name: true, teacherId: true } }),
  ]);

  const csv = fs.readFileSync("client-schedule.csv", "utf-8");
  const res = matchGridV2(parseCsvToGrid(csv, true), teachers, students, groups);

  const unknown = [...new Set(
    res.matches
      .filter((m) => m.errors.some((e) => e.startsWith("Не найден")))
      .map((m) => m.cell.cellValue)
  )];

  console.log(`Нераспознанных уникальных ячеек: ${unknown.length}\n`);
  let withSuggest = 0;
  for (const cell of unknown.slice(0, 40)) {
    const sug = suggestStudentMatches(cell, students, 3);
    if (sug.length) withSuggest++;
    const arrow = sug.length ? sug.map((s) => `${s.label} (d${s.distance})`).join("  |  ") : "— нет близких, только создать";
    console.log(`«${cell}»`.padEnd(28) + `→ ${arrow}`);
  }
  console.log(`\nИз показанных: с подсказками ${withSuggest}, без — остальные (кандидаты на «создать нового»).`);

  // Контроль: явно существующий ученик должен предлагаться первым с d0/d1.
  const sampleStudent = students[0];
  const selfSug = suggestStudentMatches(sampleStudent.firstName, students, 3);
  console.log(`\nКонтроль: "${sampleStudent.firstName}" → ${selfSug.map((s) => `${s.label}(d${s.distance})`).join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
