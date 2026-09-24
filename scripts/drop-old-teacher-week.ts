// Убирает занятия одного педагога на одной неделе — когда его расписание
// пришло заново в таблице, а старое осталось на второй записи в базе.
// Снимает копию, историю других недель НЕ трогает.
// Запуск: npx tsx scripts/drop-old-teacher-week.ts <id-педагога> <неделя> [--apply]
import * as fs from "fs";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

dotenv.config();
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});
const APPLY = process.argv.includes("--apply");

async function main() {
  const [idPrefix, week] = process.argv.slice(2);

  const teachers = await prisma.teacher.findMany();
  const teacher = teachers.find((t) => t.id.startsWith(idPrefix));
  if (!teacher) {
    console.log("Педагог не найден");
    await prisma.$disconnect();
    return;
  }

  const slots = await prisma.scheduleSlot.findMany({
    where: { teacherId: teacher.id, weekStartDate: week },
    include: { student: true, group: true },
  });
  const attendance = await prisma.attendance.count({
    where: { scheduleSlot: { teacherId: teacher.id, weekStartDate: week } },
  });
  const otherWeeks = await prisma.scheduleSlot.count({
    where: { teacherId: teacher.id, NOT: { weekStartDate: week } },
  });

  const day = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  console.log(`Педагог: ${teacher.firstName} ${teacher.lastName || "(без фамилии)"} ${teacher.patronymic ?? ""}`);
  console.log(`Неделя ${week}: занятий ${slots.length}, отметок посещаемости ${attendance}`);
  console.log(`На других неделях остаётся: ${otherWeeks} — не трогаем\n`);
  for (const s of slots.slice(0, 12)) {
    const who = s.student ? `${s.student.firstName} ${s.student.lastName}` : s.group?.name ?? s.lessonCategory ?? "—";
    console.log(`   ${day[s.dayOfWeek]} ${s.startTime} ${who}`);
  }
  if (slots.length > 12) console.log(`   … ещё ${slots.length - 12}`);

  if (attendance > 0) {
    console.log("\n⚠ Есть отметки посещаемости — останавливаюсь.");
    await prisma.$disconnect();
    return;
  }
  if (!APPLY) {
    console.log("\nСухой прогон. Для удаления добавьте --apply");
    await prisma.$disconnect();
    return;
  }

  fs.mkdirSync("backups", { recursive: true });
  const file = `backups/teacher-${teacher.id.slice(0, 8)}-${week}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(file, JSON.stringify(slots, null, 2));
  console.log(`\nКопия: ${file}`);

  const res = await prisma.scheduleSlot.deleteMany({
    where: { teacherId: teacher.id, weekStartDate: week },
  });
  console.log(`Удалено: ${res.count}`);

  await prisma.$disconnect();
}

main();
