// Проверка импортированной недели: сколько встало, есть ли цены, нет ли дублей
// и совпадает ли с тем, что обещал разбор файла. ТОЛЬКО ЧТЕНИЕ.
// Запуск: npx tsx scripts/verify-imported-week.ts 2026-09-28
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

dotenv.config();
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const week = process.argv[2];
  const slots = await prisma.scheduleSlot.findMany({
    where: { weekStartDate: week },
    include: { teacher: true, student: true, group: true },
  });

  console.log(`Неделя ${week}: занятий ${slots.length}`);

  const byDay = new Map<number, number>();
  for (const s of slots) byDay.set(s.dayOfWeek, (byDay.get(s.dayOfWeek) ?? 0) + 1);
  const dayName = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  console.log(
    "по дням: " +
      [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${dayName[d]} ${n}`).join(", "),
  );

  const ind = slots.filter((s) => s.lessonType === "INDIVIDUAL");
  const grp = slots.filter((s) => s.lessonType === "GROUP");
  const method = slots.filter((s) => s.lessonCategory === "Метод");
  const intern = slots.filter((s) => s.lessonCategory === "Стажировка");
  const sopr = slots.filter((s) => s.lessonCategory === "СОПР");
  console.log(`индивидуальных ${ind.length}, групповых ${grp.length}, метод ${method.length}, стажировок ${intern.length}, сопровождение ${sopr.length}`);

  const withStudent = ind.filter((s) => s.studentId);
  const noPrice = withStudent.filter((s) => !s.frozenPrice);
  const noService = slots.filter((s) => !s.serviceTypeId && s.lessonCategory !== "Метод" && s.lessonCategory !== "Стажировка");
  console.log(`\nс учеником: ${withStudent.length}, без замороженной цены: ${noPrice.length}, без типа услуги: ${noService.length}`);
  if (noPrice.length) {
    const names = [...new Set(noPrice.map((s) => `${s.student?.lastName} ${s.student?.firstName}`))];
    console.log(`   без цены (нет строки в матрице): ${names.slice(0, 12).join(", ")}${names.length > 12 ? ` … ещё ${names.length - 12}` : ""}`);
  }

  // Дубли: один педагог в одно время в один день
  const seen = new Map<string, number>();
  for (const s of slots) {
    const k = `${s.teacherId}|${s.dayOfWeek}|${s.startTime}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const dupes = [...seen.values()].filter((n) => n > 1).length;
  console.log(`\nпедагог занят дважды в одно время: ${dupes}`);

  // Один ученик в одно время у разных педагогов
  const stSeen = new Map<string, Set<string>>();
  for (const s of slots) {
    if (!s.studentId) continue;
    const k = `${s.studentId}|${s.dayOfWeek}|${s.startTime}`;
    stSeen.set(k, (stSeen.get(k) ?? new Set()).add(s.teacherId));
  }
  const stDupes = [...stSeen.values()].filter((v) => v.size > 1).length;
  console.log(`ученик у двух педагогов в одно время: ${stDupes}`);

  // Ученики, отмеченные «не ходит», но попавшие в расписание
  const inactive = slots.filter((s) => s.student && !s.student.isActive);
  console.log(`занятий у детей со статусом «не ходит»: ${inactive.length}`);

  await prisma.$disconnect();
}

main();
