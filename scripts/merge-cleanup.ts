// Мердж дубликатов «без номера» в соответствующих «с номером», затем soft-delete
// (isActive=false) для тех у кого нет пары. Запуск:
//   npx tsx scripts/merge-cleanup.ts            # dry-run
//   npx tsx scripts/merge-cleanup.ts --apply    # применить
//
// Логика поиска пары:
//   Для каждого Student/Teacher без номера ищем среди пронумерованных одного с
//   fuzzy-совпадением (нормализованные слова Имя/Отчество/Фамилия, допускается
//   Levenshtein ≤ 1 на длинных словах — Дайана/Даяна, Владимировна/Владимеровна).
//
// При мердже переносим ВСЕ связи на правильную запись и помечаем дубль
// isActive=false. Если пара не найдена — просто деактивация.

import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

dotenv.config();
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const apply = process.argv.includes("--apply");

function normWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^а-яёa-zа-ұіңғүқөһәҰІҢҒҮҚӨҺӘ]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
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

function fuzzyEq(a: string, b: string): boolean {
  if (a === b || a.startsWith(b) || b.startsWith(a)) return true;
  if (a.length >= 5 && b.length >= 5 && levenshtein(a, b) <= 1) return true;
  return false;
}

function similarity<T extends { lastName: string; firstName: string; patronymic?: string | null }>(
  a: T,
  b: T,
): number {
  // Считаем сколько ключевых слов совпадает между двумя записями (firstName, lastName, patronymic)
  const aw = [a.firstName.toLowerCase(), a.lastName.toLowerCase()];
  if (a.patronymic) aw.push(a.patronymic.toLowerCase());
  const bw = [b.firstName.toLowerCase(), b.lastName.toLowerCase()];
  if (b.patronymic) bw.push(b.patronymic.toLowerCase());

  let matches = 0;
  for (const x of aw) {
    if (bw.some((y) => fuzzyEq(x, y))) matches++;
  }
  return matches;
}

// Найти пару «с номером» для записи без номера. Возвращает null если не найдено
// или неоднозначно.
function findMergeTarget<T extends { id: string; lastName: string; firstName: string; patronymic?: string | null }>(
  noNum: T,
  pool: T[],
): T | null {
  const scored = pool
    .map((p) => ({ p, score: similarity(noNum, p) }))
    .filter((x) => x.score >= 2) // нужно минимум 2 совпадения (имя+отчество, имя+фамилия)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;
  // Уверенный мердж: лучший выше второго на 1+ балл, либо только один кандидат
  if (scored.length === 1) return scored[0].p;
  if (scored[0].score > scored[1].score) return scored[0].p;
  return null; // неоднозначно
}

async function mergeStudent(fromId: string, toId: string): Promise<{ slots: number; attendees: number; attendance: number; payments: number; misc: number }> {
  let slots = 0, attendees = 0, attendance = 0, payments = 0, misc = 0;
  await prisma.$transaction(async (tx) => {
    // ScheduleSlot.studentId
    const r1 = await tx.scheduleSlot.updateMany({ where: { studentId: fromId }, data: { studentId: toId } });
    slots = r1.count;
    // Attendance.studentId
    const r2 = await tx.attendance.updateMany({ where: { studentId: fromId }, data: { studentId: toId } });
    attendance = r2.count;
    // Payment.studentId
    const r3 = await tx.payment.updateMany({ where: { studentId: fromId }, data: { studentId: toId } });
    payments = r3.count;
    // SlotAttendee — может быть unique conflict (slotId, studentId). Удаляем дубли, остальное переносим.
    const attFrom = await tx.slotAttendee.findMany({ where: { studentId: fromId } });
    for (const a of attFrom) {
      const exists = await tx.slotAttendee.findUnique({
        where: { slotId_studentId: { slotId: a.slotId, studentId: toId } },
      });
      if (exists) {
        await tx.slotAttendee.delete({ where: { id: a.id } });
      } else {
        await tx.slotAttendee.update({ where: { id: a.id }, data: { studentId: toId } });
        attendees++;
      }
    }
    // GroupMember — тот же подход
    const gmFrom = await tx.groupMember.findMany({ where: { studentId: fromId } });
    for (const gm of gmFrom) {
      const exists = await tx.groupMember.findUnique({
        where: { groupId_studentId: { groupId: gm.groupId, studentId: toId } },
      });
      if (exists) {
        await tx.groupMember.delete({ where: { id: gm.id } });
      } else {
        await tx.groupMember.update({ where: { id: gm.id }, data: { studentId: toId } });
        misc++;
      }
    }
    // Остальные studentId-связи: ScheduleFreeze, StudentFreeze, Recalculation, TariffHistory,
    // ParentInteraction, StudentServicePrice
    for (const model of ["scheduleFreeze", "studentFreeze", "recalculation", "tariffHistory", "parentInteraction", "studentServicePrice"] as const) {
      // @ts-expect-error — dynamic model access
      const r = await tx[model].updateMany({ where: { studentId: fromId }, data: { studentId: toId } });
      misc += r.count;
    }
    // Soft-delete дубля
    await tx.student.update({ where: { id: fromId }, data: { isActive: false } });
  });
  return { slots, attendees, attendance, payments, misc };
}

async function mergeTeacher(fromId: string, toId: string): Promise<{ slots: number; assist2: number }> {
  let slots = 0, assist2 = 0;
  await prisma.$transaction(async (tx) => {
    const r1 = await tx.scheduleSlot.updateMany({ where: { teacherId: fromId }, data: { teacherId: toId } });
    slots = r1.count;
    // Attendance.assistant2TeacherId
    const r2 = await tx.attendance.updateMany({ where: { assistant2TeacherId: fromId }, data: { assistant2TeacherId: toId } });
    assist2 = r2.count;
    // ScheduleFreeze.teacherId
    await tx.scheduleFreeze.updateMany({ where: { teacherId: fromId }, data: { teacherId: toId } });
    // Soft-delete
    await tx.teacher.update({ where: { id: fromId }, data: { isActive: false } });
  });
  return { slots, assist2 };
}

async function main() {
  console.log(apply ? "=== РЕЖИМ: APPLY ===" : "=== РЕЖИМ: DRY-RUN ===");

  // === УЧЕНИКИ ===
  const sNoNum = await prisma.student.findMany({
    where: { studentNumber: null, isActive: true },
    select: { id: true, lastName: true, firstName: true, patronymic: true },
  });
  const sWithNum = await prisma.student.findMany({
    where: { studentNumber: { not: null }, isActive: true },
    select: { id: true, lastName: true, firstName: true, patronymic: true, studentNumber: true },
  });

  console.log(`\n--- УЧЕНИКИ ---`);
  console.log(`Без номера: ${sNoNum.length}, с номером: ${sWithNum.length}`);

  let sMerged = 0, sDeactivated = 0;
  for (const s of sNoNum) {
    const target = findMergeTarget(s, sWithNum);
    if (target) {
      const label = `${s.lastName} ${s.firstName} → #${(target as any).studentNumber} ${target.lastName} ${target.firstName}`;
      if (apply) {
        const stats = await mergeStudent(s.id, target.id);
        console.log(`  ⇒ МЕРДЖ ${label}  [${stats.slots} слот / ${stats.attendance} посещ / ${stats.payments} оплат / ${stats.misc + stats.attendees} проч.]`);
      } else {
        console.log(`  ⇒ МЕРДЖ ${label}`);
      }
      sMerged++;
    } else {
      const label = `${s.lastName} ${s.firstName}`;
      if (apply) {
        await prisma.student.update({ where: { id: s.id }, data: { isActive: false } });
        console.log(`  ✗ деактив ${label}`);
      } else {
        console.log(`  ✗ деактив ${label}`);
      }
      sDeactivated++;
    }
  }
  console.log(`Итого: мерджено ${sMerged}, деактивировано ${sDeactivated}`);

  // === ПЕДАГОГИ ===
  const tNoNum = await prisma.teacher.findMany({
    where: { teacherNumber: null, isActive: true },
    select: { id: true, lastName: true, firstName: true, patronymic: true },
  });
  const tWithNum = await prisma.teacher.findMany({
    where: { teacherNumber: { not: null }, isActive: true },
    select: { id: true, lastName: true, firstName: true, patronymic: true, teacherNumber: true },
  });

  console.log(`\n--- ПЕДАГОГИ ---`);
  console.log(`Без номера: ${tNoNum.length}, с номером: ${tWithNum.length}`);

  let tMerged = 0, tDeactivated = 0;
  for (const t of tNoNum) {
    const target = findMergeTarget(t, tWithNum);
    if (target) {
      const label = `${t.lastName} ${t.firstName} → #${(target as any).teacherNumber} ${target.lastName} ${target.firstName}`;
      if (apply) {
        const stats = await mergeTeacher(t.id, target.id);
        console.log(`  ⇒ МЕРДЖ ${label}  [${stats.slots} слот / ${stats.assist2} 2-й асс.]`);
      } else {
        console.log(`  ⇒ МЕРДЖ ${label}`);
      }
      tMerged++;
    } else {
      const label = `${t.lastName} ${t.firstName}`;
      if (apply) {
        await prisma.teacher.update({ where: { id: t.id }, data: { isActive: false } });
        console.log(`  ✗ деактив ${label}`);
      } else {
        console.log(`  ✗ деактив ${label}`);
      }
      tDeactivated++;
    }
  }
  console.log(`Итого: мерджено ${tMerged}, деактивировано ${tDeactivated}`);

  console.log(`\n${apply ? "Применено в БД." : "Это был DRY-RUN. Запусти с --apply для применения."}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
