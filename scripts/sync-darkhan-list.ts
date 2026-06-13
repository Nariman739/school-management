// Сверка списков Дархана (xlsx с листами «Список детей» / «Список педагогов»)
// с текущей БД. Печатает кого найдём, кого нет.
// Запуск: npx tsx scripts/sync-darkhan-list.ts /path/to/file.xlsx [--apply]
import * as XLSX from "xlsx";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

dotenv.config();
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const filePath = process.argv[2];
const apply = process.argv.includes("--apply");

if (!filePath) {
  console.error("Usage: npx tsx scripts/sync-darkhan-list.ts <file.xlsx> [--apply]");
  process.exit(1);
}

function normWords(s: string): string[] {
  return s.toLowerCase().replace(/[^а-яёa-zа-ұіңғүқөһәҰІҢҒҮҚӨҺӘ]/gi, " ").split(/\s+/).filter((w) => w.length >= 2);
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const prev = new Array(n + 1), curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function fuzzyWordMatch(q: string, target: string): boolean {
  if (q === target || target.startsWith(q) || q.startsWith(target)) return true;
  if (q.length >= 5 && target.length >= 5 && levenshtein(q, target) <= 1) return true;
  return false;
}

function poolWords(p: { lastName: string; firstName: string; patronymic?: string | null }): string[] {
  return normWords(`${p.lastName} ${p.firstName} ${p.patronymic ?? ""}`);
}

// Возвращает кандидатов: точный матч (все слова найдены), потом fallback на 2 слова.
function findCandidates<T extends { lastName: string; firstName: string; patronymic?: string | null }>(
  query: string,
  pool: T[],
): T[] {
  const qWords = normWords(query);
  if (qWords.length === 0) return [];

  const allMatch = pool.filter((p) => {
    const pw = poolWords(p);
    return qWords.every((q) => pw.some((w) => fuzzyWordMatch(q, w)));
  });
  if (allMatch.length > 0) return allMatch;

  if (qWords.length >= 2) {
    const key2 = qWords.slice(0, 2);
    const twoMatch = pool.filter((p) => {
      const pw = poolWords(p);
      return key2.every((q) => pw.some((w) => fuzzyWordMatch(q, w)));
    });
    if (twoMatch.length > 0) return twoMatch;
  }

  return [];
}

async function syncStudents(rows: { name: string; abbr?: string }[]) {
  const all = await prisma.student.findMany({
    select: { id: true, lastName: true, firstName: true, patronymic: true, studentNumber: true },
  });

  let exact = 0, ambiguous = 0, missing = 0;
  const result: Array<{ idx: number; name: string; abbr?: string; match: string; matchedId?: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const { name, abbr } = rows[i];
    if (normWords(name).length === 0) continue;

    const candidates = findCandidates(name, all);

    const targetNum = i + 1;
    if (candidates.length === 1) {
      exact++;
      const c = candidates[0];
      result.push({
        idx: targetNum,
        name,
        abbr,
        match: `${c.lastName} ${c.firstName}`,
        matchedId: c.id,
      });
    } else if (candidates.length > 1) {
      ambiguous++;
      result.push({
        idx: targetNum,
        name,
        abbr,
        match: `НЕОДНОЗНАЧНО (${candidates.length}): ${candidates.slice(0, 3).map((c) => c.lastName).join(", ")}`,
      });
    } else {
      missing++;
      result.push({ idx: targetNum, name, abbr, match: "НЕТ В БД" });
    }
  }

  console.log(`\nУченики: ${exact} точно / ${ambiguous} неоднозначно / ${missing} не найдено (всего ${rows.length})`);
  for (const r of result.filter((x) => !x.match.startsWith("НЕТ В БД"))) {
    console.log(`  #${r.idx.toString().padStart(3, "0")} "${r.name}" → ${r.match}`);
  }
  console.log(`\nНЕ найдены в БД (${missing}):`);
  for (const r of result.filter((x) => x.match === "НЕТ В БД")) {
    console.log(`  #${r.idx.toString().padStart(3, "0")} "${r.name}" (${r.abbr ?? "—"})`);
  }

  if (apply) {
    console.log("\n=== ПРИМЕНЯЕМ ===");
    await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS student_number_seq START WITH 1 INCREMENT BY 1;`);

    // 1) Сбрасываем все номера в null (чтобы не было дубликатов при UNIQUE)
    await prisma.$executeRawUnsafe(`UPDATE "Student" SET "studentNumber" = NULL;`);
    console.log("  ✓ studentNumber сброшен у всех");

    // 2) Проставляем номера найденным
    for (const r of result.filter((x) => x.matchedId)) {
      await prisma.student.update({
        where: { id: r.matchedId! },
        data: { studentNumber: r.idx },
      });
    }
    console.log(`  ✓ Пронумеровано ${result.filter((x) => x.matchedId).length} учеников`);

    // 3) Создаём недостающих
    for (const r of result.filter((x) => x.match === "НЕТ В БД")) {
      const words = r.name.trim().split(/\s+/);
      const lastName = words[0] ?? "";
      const firstName = words.slice(1).join(" ") || "—";
      await prisma.student.create({
        data: { lastName, firstName, studentNumber: r.idx },
      });
    }
    console.log(`  ✓ Создано ${missing} новых учеников`);

    // 4) Sync sequence
    await prisma.$executeRawUnsafe(`SELECT setval('student_number_seq', $1, true);`, rows.length);
    console.log(`  ✓ sequence student_number_seq → ${rows.length + 1}`);
  }
}

async function syncTeachers(rows: { name: string }[]) {
  const all = await prisma.teacher.findMany({
    where: { isActive: true },
    select: { id: true, lastName: true, firstName: true, patronymic: true, teacherNumber: true },
  });

  let exact = 0, ambiguous = 0, missing = 0;
  const result: Array<{ idx: number; name: string; match: string; matchedId?: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const { name } = rows[i];
    if (normWords(name).length === 0) continue;

    const candidates = findCandidates(name, all);

    const targetNum = i + 1;
    if (candidates.length === 1) {
      exact++;
      const c = candidates[0];
      result.push({
        idx: targetNum,
        name,
        match: `${c.lastName} ${c.firstName}`,
        matchedId: c.id,
      });
    } else if (candidates.length > 1) {
      ambiguous++;
      result.push({
        idx: targetNum,
        name,
        match: `НЕОДНОЗНАЧНО (${candidates.length})`,
      });
    } else {
      missing++;
      result.push({ idx: targetNum, name, match: "НЕТ В БД" });
    }
  }

  console.log(`\nПедагоги: ${exact} точно / ${ambiguous} неоднозначно / ${missing} не найдено (всего ${rows.length})`);
  for (const r of result) {
    console.log(`  #${r.idx.toString().padStart(2, "0")} "${r.name}" → ${r.match}`);
  }

  if (apply) {
    console.log("\n=== ПРИМЕНЯЕМ ===");
    await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS teacher_number_seq START WITH 1 INCREMENT BY 1;`);
    await prisma.$executeRawUnsafe(`UPDATE "Teacher" SET "teacherNumber" = NULL;`);
    console.log("  ✓ teacherNumber сброшен у всех");

    for (const r of result.filter((x) => x.matchedId)) {
      await prisma.teacher.update({
        where: { id: r.matchedId! },
        data: { teacherNumber: r.idx },
      });
    }
    console.log(`  ✓ Пронумеровано ${result.filter((x) => x.matchedId).length} педагогов`);

    for (const r of result.filter((x) => x.match === "НЕТ В БД")) {
      const words = r.name.trim().split(/\s+/);
      const lastName = words[0] ?? "";
      const firstName = words[1] ?? "—";
      const patronymic = words.slice(2).join(" ") || null;
      await prisma.teacher.create({
        data: { lastName, firstName, patronymic, teacherNumber: r.idx },
      });
    }
    console.log(`  ✓ Создано ${missing} новых педагогов`);

    await prisma.$executeRawUnsafe(`SELECT setval('teacher_number_seq', $1, true);`, rows.length);
    console.log(`  ✓ sequence teacher_number_seq → ${rows.length + 1}`);
  }
}

async function main() {
  const wb = XLSX.readFile(filePath);

  const studentsSheet = wb.SheetNames.find((s) => /список\s*детей/i.test(s));
  const teachersSheet = wb.SheetNames.find((s) => /список\s*педагогов/i.test(s));

  if (studentsSheet) {
    const ws = wb.Sheets[studentsSheet];
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
    const rows = data
      .map((r) => ({ name: String(r[0] ?? "").trim(), abbr: String(r[1] ?? "").trim() }))
      .filter((r) => r.name.length > 0 && !/^[№N]/i.test(r.name));
    await syncStudents(rows);
  }

  if (teachersSheet) {
    const ws = wb.Sheets[teachersSheet];
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
    const rows = data
      .map((r) => ({ name: String(r[0] ?? "").trim() }))
      .filter((r) => r.name.length > 0);
    await syncTeachers(rows);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
