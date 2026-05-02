// Запуск: npx tsx scripts/seed-demo-prep.ts
// Подготовка перед демо для Дархана:
// 1) teacher@school.kz / teacher123 (роль TEACHER, привязка к Хитрик Дарье)
// 2) тарифы для 99 учеников (микс PER_LESSON / SUBSCRIPTION)
// 3) филиал "Центр Дархана, Павлодар"

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { hash } from "bcryptjs";
import * as dotenv from "dotenv";

dotenv.config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function seedTeacherUser() {
  const email = "teacher@school.kz";
  const password = "teacher123";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✓ teacher уже существует: ${email}`);
    return;
  }

  const teacher = await prisma.teacher.findFirst({
    where: { lastName: { contains: "Хитрик" } },
  });
  if (!teacher) {
    console.log("✗ Не нашёл педагога Хитрик — пропускаю teacher user");
    return;
  }

  const passwordHash = await hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: `${teacher.lastName} ${teacher.firstName}`,
      role: "TEACHER",
      teacherId: teacher.id,
    },
  });
  console.log(`✓ Создан teacher: ${user.email} / ${password} → ${teacher.lastName}`);
}

async function seedTariffs() {
  const students = await prisma.student.findMany({
    where: { isActive: true },
    orderBy: { lastName: "asc" },
  });

  console.log(`Найдено ${students.length} активных учеников`);

  // Распределение: каждый 3-й на абонементе (33%), остальные по часам (67%)
  const perLessonRates = [3500, 4000, 4500, 5000];
  const subscriptions = [
    { rate: 28000, lessons: 8 },
    { rate: 32000, lessons: 8 },
    { rate: 38000, lessons: 12 },
    { rate: 42000, lessons: 12 },
  ];

  let perLessonCount = 0;
  let subscriptionCount = 0;

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    if (i % 3 === 0) {
      const sub = subscriptions[i % subscriptions.length];
      await prisma.student.update({
        where: { id: s.id },
        data: {
          tariffType: "SUBSCRIPTION",
          subscriptionRate: sub.rate,
          subscriptionLessons: sub.lessons,
          hourlyRate: Math.round(sub.rate / sub.lessons),
        },
      });
      subscriptionCount++;
    } else {
      const rate = perLessonRates[i % perLessonRates.length];
      await prisma.student.update({
        where: { id: s.id },
        data: {
          tariffType: "PER_LESSON",
          hourlyRate: rate,
          subscriptionRate: null,
          subscriptionLessons: null,
        },
      });
      perLessonCount++;
    }
  }

  console.log(`✓ PER_LESSON: ${perLessonCount} учеников (3500-5000 тг/час)`);
  console.log(`✓ SUBSCRIPTION: ${subscriptionCount} учеников (28-42К тг/мес)`);
}

async function seedBranch() {
  const existing = await prisma.branch.findFirst({
    where: { name: { contains: "Дархан" } },
  });
  if (existing) {
    console.log(`✓ Филиал уже существует: ${existing.name}`);
    return;
  }

  const branch = await prisma.branch.create({
    data: {
      name: "Центр Дархана, Павлодар",
      address: "г. Павлодар",
      isActive: true,
    },
  });
  console.log(`✓ Создан филиал: ${branch.name} (id: ${branch.id})`);
}

async function main() {
  console.log("=== Подготовка демо для Дархана ===\n");
  await seedTeacherUser();
  console.log("");
  await seedTariffs();
  console.log("");
  await seedBranch();
  console.log("\n=== Готово ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
