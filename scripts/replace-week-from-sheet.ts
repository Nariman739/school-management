// Готовит неделю к перезаливке из Google-таблицы: снимает копию всех занятий
// недели и удаляет занятия ТОЛЬКО тех педагогов, которые есть в таблице.
// Педагогов, которых в таблице нет, не трогает — их расписание останется как было.
// Сухой прогон по умолчанию, удаление — с --apply.
// Запуск: npx tsx scripts/replace-week-from-sheet.ts <ссылка> <неделя> [--apply]
import * as fs from "fs";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { extractSheetId, buildCsvUrl, parseCsvToGrid, detectFormat, matchGridV2 } from "../src/lib/import-utils";

dotenv.config();
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});
const APPLY = process.argv.includes("--apply");

async function main() {
  const [url, week] = process.argv.slice(2);

  const csv = await (await fetch(buildCsvUrl(extractSheetId(url)!))).text();
  const grid = parseCsvToGrid(csv, true);
  const [teachers, students, groups] = await Promise.all([
    prisma.teacher.findMany({ where: { isActive: true } }),
    prisma.student.findMany({ where: { isActive: true } }),
    prisma.group.findMany(),
  ]);
  const result = matchGridV2(grid, teachers, students, groups, detectFormat(grid));
  const sheetTeacherIds = new Set(
    result.matches.filter((m) => m.errors.length === 0 && m.teacherId).map((m) => m.teacherId!),
  );

  const all = await prisma.scheduleSlot.findMany({
    where: { weekStartDate: week },
    include: { teacher: true, student: true, group: true },
  });
  const attendance = await prisma.attendance.count({ where: { scheduleSlot: { weekStartDate: week } } });

  const toDelete = all.filter((s) => sheetTeacherIds.has(s.teacherId));
  const toKeep = all.filter((s) => !sheetTeacherIds.has(s.teacherId));

  const keptByTeacher = new Map<string, number>();
  for (const s of toKeep) {
    const name = `${s.teacher.firstName} ${s.teacher.lastName}`;
    keptByTeacher.set(name, (keptByTeacher.get(name) ?? 0) + 1);
  }

  console.log(`Неделя ${week}: занятий ${all.length}, отметок посещаемости ${attendance}`);
  console.log(`Педагогов в таблице: ${sheetTeacherIds.size}`);
  console.log(`\nУдалить (эти педагоги есть в таблице): ${toDelete.length}`);
  console.log(`Оставить (этих педагогов в таблице нет): ${toKeep.length}`);
  for (const [name, n] of [...keptByTeacher.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${name} — ${n}`);
  }

  if (attendance > 0) {
    console.log(`\n⚠ На неделе есть отметки посещаемости (${attendance}) — удаление их затронет. Останавливаюсь.`);
    await prisma.$disconnect();
    return;
  }

  if (!APPLY) {
    console.log("\nСухой прогон. Для удаления добавьте --apply");
    await prisma.$disconnect();
    return;
  }

  fs.mkdirSync("backups", { recursive: true });
  const file = `backups/week-${week}-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(file, JSON.stringify(all, null, 2));
  console.log(`\nКопия всех ${all.length} занятий недели: ${file}`);

  const res = await prisma.scheduleSlot.deleteMany({ where: { id: { in: toDelete.map((s) => s.id) } } });
  console.log(`Удалено: ${res.count}. Осталось на неделе: ${all.length - res.count}`);
  console.log("Теперь можно импортировать таблицу на эту неделю.");

  await prisma.$disconnect();
}

main();
