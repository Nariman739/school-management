// Чинит занятия-пары, импортированные без участников: заново разбирает исходный
// файл, находит ячейки «X+Y», собирает пару в группу и проставляет её в слот.
// Сухой прогон по умолчанию, запись — с --apply.
// Запуск: npx tsx scripts/repair-imported-pairs.ts <расписание.xlsx> <неделя> [--apply]
import * as XLSX from "xlsx";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { detectFormat, matchGridV2 } from "../src/lib/import-utils";
import type { MatchedRowV2 } from "../src/lib/import-utils";

dotenv.config();
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const DAYS: Record<string, number[]> = { mwf: [1, 3, 5], tt: [2, 4], sat: [6] };
const APPLY = process.argv.includes("--apply");

async function getOrCreatePairGroup(teacherId: string, studentIds: string[]) {
  const want = [...studentIds].sort();
  const candidates = await prisma.group.findMany({
    where: { teacherId, groupType: "PAIR" },
    include: { members: true },
  });
  for (const g of candidates) {
    const ids = g.members.map((m) => m.studentId).sort();
    if (ids.length === 2 && ids[0] === want[0] && ids[1] === want[1]) return g.id;
  }
  if (!APPLY) return "(новая пара)";
  const created = await prisma.group.create({
    data: {
      teacherId,
      groupType: "PAIR",
      name: null,
      members: { createMany: { data: studentIds.map((studentId) => ({ studentId })) } },
    },
  });
  return created.id;
}

async function main() {
  const [file, week] = process.argv.slice(2);

  const broken = await prisma.scheduleSlot.findMany({
    where: { weekStartDate: week, studentId: null, groupId: null, NOT: { lessonCategory: { in: ["Метод", "Стажировка"] } } },
    include: { teacher: true },
  });
  console.log(`Занятий без участников на неделе ${week}: ${broken.length}`);
  if (broken.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = (XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }) as unknown[][]).map(
    (r) => r.map((c) => (c == null ? "" : String(c))),
  );
  const [teachers, students, groups] = await Promise.all([
    prisma.teacher.findMany({ where: { isActive: true } }),
    prisma.student.findMany({ where: { isActive: true } }),
    prisma.group.findMany(),
  ]);
  const result = matchGridV2(grid, teachers, students, groups, detectFormat(grid));

  const pairs = (result.matches as MatchedRowV2[]).filter(
    (m) => m.errors.length === 0 && m.lessonType === "PAIR" && m.pairStudentIds?.length === 2,
  );
  console.log(`Ячеек-пар в файле: ${pairs.length}`);

  let fixed = 0;
  for (const m of pairs) {
    const days = m.days ?? DAYS[m.dayGroup] ?? [];
    const groupId = await getOrCreatePairGroup(m.teacherId!, m.pairStudentIds!);
    const names = m.pairStudentIds!
      .map((id) => {
        const s = students.find((x) => x.id === id);
        return s ? `${s.firstName} ${s.lastName}` : "?";
      })
      .join(" + ");

    for (const dayOfWeek of days) {
      const slot = broken.find(
        (b) => b.teacherId === m.teacherId && b.dayOfWeek === dayOfWeek && b.startTime === m.startTime,
      );
      if (!slot) continue;
      console.log(`   ${m.teacherLabel}, день ${dayOfWeek} ${m.startTime} → пара ${names}`);
      if (APPLY) {
        await prisma.scheduleSlot.update({
          where: { id: slot.id },
          data: { groupId, lessonType: "GROUP" },
        });
      }
      fixed++;
    }
  }

  console.log(`\n${APPLY ? "Починено" : "Будет починено"}: ${fixed} из ${broken.length}`);
  if (!APPLY) console.log("Сухой прогон. Для записи добавьте --apply");
  await prisma.$disconnect();
}

main();
