// Импортирует ID-номера учеников/педагогов из xlsx-списка Дархана.
// Формат файла (любой xlsx):
//   Колонка A: ID (число)
//   Колонка B: ФИО (строка вида "Тулегенова Адель" или "Адель Тулегенова")
//
// Запуск:
//   npx tsx scripts/import-darkhan-numbers.ts students /path/to/students.xlsx
//   npx tsx scripts/import-darkhan-numbers.ts teachers /path/to/teachers.xlsx
//
// Поведение:
// - Для каждой строки ищет ученика/педагога по ФИО (любым порядком слов).
// - Если найден ОДИН — обновляет teacherNumber / studentNumber.
// - Если несколько кандидатов — печатает варианты и пропускает (Дархан решит).
// - Если не найден — печатает «НЕ НАЙДЕН».
// - В конце: синхронизирует sequence на MAX(номер) + 1.

import * as XLSX from "xlsx";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

dotenv.config();
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

type Mode = "students" | "teachers";

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^а-яёa-z\s]/gi, "").replace(/\s+/g, " ").trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter((t) => t.length >= 2);
}

async function findStudent(query: string) {
  const qTokens = tokens(query);
  if (qTokens.length === 0) return [];

  const all = await prisma.student.findMany({
    select: { id: true, lastName: true, firstName: true, patronymic: true, studentNumber: true },
  });

  return all.filter((s) => {
    const sTokens = tokens(`${s.lastName} ${s.firstName} ${s.patronymic ?? ""}`);
    return qTokens.every((q) => sTokens.some((st) => st === q || st.startsWith(q) || q.startsWith(st)));
  });
}

async function findTeacher(query: string) {
  const qTokens = tokens(query);
  if (qTokens.length === 0) return [];

  const all = await prisma.teacher.findMany({
    select: { id: true, lastName: true, firstName: true, patronymic: true, teacherNumber: true },
  });

  return all.filter((t) => {
    const tTokens = tokens(`${t.lastName} ${t.firstName} ${t.patronymic ?? ""}`);
    return qTokens.every((q) => tTokens.some((st) => st === q || st.startsWith(q) || q.startsWith(st)));
  });
}

async function main() {
  const mode = process.argv[2] as Mode;
  const filePath = process.argv[3];

  if (!["students", "teachers"].includes(mode) || !filePath) {
    console.error("Usage: npx tsx scripts/import-darkhan-numbers.ts <students|teachers> <file.xlsx>");
    process.exit(1);
  }

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];

  let updated = 0;
  let ambiguous = 0;
  let notFound = 0;
  let maxNumber = 0;

  for (let i = 0; i < rows.length; i++) {
    const idRaw = rows[i]?.[0];
    const nameRaw = rows[i]?.[1];
    if (idRaw == null || nameRaw == null) continue;
    const id = Number(String(idRaw).trim());
    const name = String(nameRaw).trim();
    if (!Number.isFinite(id) || id <= 0 || !name) continue;

    if (id > maxNumber) maxNumber = id;

    const candidates = mode === "students" ? await findStudent(name) : await findTeacher(name);

    if (candidates.length === 0) {
      console.log(`✗ #${id.toString().padStart(3, "0")} "${name}" — НЕ НАЙДЕН`);
      notFound++;
      continue;
    }

    if (candidates.length > 1) {
      console.log(`? #${id.toString().padStart(3, "0")} "${name}" — несколько кандидатов:`);
      for (const c of candidates) {
        console.log(`     • ${c.lastName} ${c.firstName} ${c.patronymic ?? ""}`);
      }
      ambiguous++;
      continue;
    }

    const target = candidates[0];
    if (mode === "students") {
      await prisma.student.update({
        where: { id: target.id },
        data: { studentNumber: id },
      });
    } else {
      await prisma.teacher.update({
        where: { id: target.id },
        data: { teacherNumber: id },
      });
    }
    console.log(
      `✓ #${id.toString().padStart(3, "0")} → ${target.lastName} ${target.firstName} ${target.patronymic ?? ""}`,
    );
    updated++;
  }

  // Sync sequence
  const seqName = mode === "students" ? "student_number_seq" : "teacher_number_seq";
  await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS ${seqName} START WITH 1 INCREMENT BY 1;`);
  await prisma.$executeRawUnsafe(`SELECT setval('${seqName}', $1, true);`, maxNumber);

  console.log(`\n=== Итого ===`);
  console.log(`  Обновлено: ${updated}`);
  console.log(`  Неоднозначно: ${ambiguous}`);
  console.log(`  Не найдено: ${notFound}`);
  console.log(`  Sequence ${seqName} → ${maxNumber + 1} (следующий новый получит этот номер)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
