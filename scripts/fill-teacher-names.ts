// Заполняет ФИО педагогов по списку, который прислал Дархан 24.09.
// Меняет ТОЛЬКО имя/фамилию/отчество — ставки, кабинет и методиста не трогает.
// Сухой прогон по умолчанию, запись — с --apply.
// Запуск: npx tsx scripts/fill-teacher-names.ts [--apply]
import * as fs from "fs";
import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

dotenv.config();
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});
const APPLY = process.argv.includes("--apply");

// Ищем по имени + отчеству (так педагоги в базе различимы), ставим полное ФИО.
const FIXES: { findFirst: string; findPatr: string | null; lastName: string; firstName?: string; patronymic?: string }[] = [
  { findFirst: "Аяулым", findPatr: "Геннадиевна", lastName: "Пакина", patronymic: "Геннадикызы" },
  { findFirst: "Анель", findPatr: "Амангельдиновна", lastName: "Темиржанова", firstName: "Анеля" },
  { findFirst: "Даяна", findPatr: "Сагитовна", lastName: "Минуарова", firstName: "Дайана" },
  { findFirst: "Мадина", findPatr: "Жанболатовна", lastName: "Калижан", patronymic: "Жанболаткызы" },
  { findFirst: "Алина", findPatr: "Эдуардовна", lastName: "Ерофеева" },
  { findFirst: "Жанель", findPatr: "Женисовна", lastName: "Капсаматова" },
  // фамилию Дархан не дал — уточняем только отчество
  { findFirst: "Гаухар", findPatr: null, lastName: "", patronymic: "Санаткызы" },
  { findFirst: "Баянсулу", findPatr: null, lastName: "", patronymic: "Сериккызы" },
  // опечатка в отчестве у записи с фамилией
  { findFirst: "Дарья", findPatr: "Владимеровна", lastName: "Боромыко", patronymic: "Владимировна" },
];

async function main() {
  const teachers = await prisma.teacher.findMany({
    select: { id: true, firstName: true, lastName: true, patronymic: true, _count: { select: { scheduleSlots: true } } },
  });

  const plan: { id: string; was: string; will: string; data: Record<string, string> }[] = [];

  for (const fix of FIXES) {
    const found = teachers.filter(
      (t) =>
        t.firstName === fix.findFirst &&
        (fix.findPatr === null || (t.patronymic ?? "") === fix.findPatr),
    );
    if (found.length !== 1) {
      console.log(`⚠ ${fix.findFirst} ${fix.findPatr ?? ""}: кандидатов ${found.length} — пропускаю`);
      continue;
    }
    const t = found[0];
    const data: Record<string, string> = {};
    if (fix.lastName && t.lastName !== fix.lastName) data.lastName = fix.lastName;
    if (fix.firstName && t.firstName !== fix.firstName) data.firstName = fix.firstName;
    if (fix.patronymic && (t.patronymic ?? "") !== fix.patronymic) data.patronymic = fix.patronymic;
    if (Object.keys(data).length === 0) {
      console.log(`= ${t.firstName} ${t.lastName} ${t.patronymic ?? ""} — уже верно`);
      continue;
    }
    plan.push({
      id: t.id,
      was: `${t.firstName} ${t.lastName || "(без фамилии)"} ${t.patronymic ?? ""}`.trim(),
      will: `${data.firstName ?? t.firstName} ${data.lastName ?? t.lastName} ${data.patronymic ?? t.patronymic ?? ""}`.trim(),
      data,
    });
  }

  console.log(`\nК исправлению: ${plan.length}`);
  for (const p of plan) console.log(`   ${p.was}  →  ${p.will}`);

  if (!APPLY) {
    console.log("\nСухой прогон. Для записи добавьте --apply");
    await prisma.$disconnect();
    return;
  }

  fs.mkdirSync("backups", { recursive: true });
  const file = `backups/teachers-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(file, JSON.stringify(teachers, null, 2));
  console.log(`\nКопия: ${file}`);

  for (const p of plan) {
    await prisma.teacher.update({ where: { id: p.id }, data: p.data });
  }
  console.log(`Исправлено педагогов: ${plan.length}`);

  await prisma.$disconnect();
}

main();
