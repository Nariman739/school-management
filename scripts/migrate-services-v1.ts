// Запуск: npx tsx scripts/migrate-services-v1.ts
//
// Миграция данных под новую модель цен (ServiceType + StudentServicePrice + studentNumber).
// Прогоняется ОДИН РАЗ, идемпотентна (можно перезапускать).
//
// ОБЯЗАТЕЛЬНО перед запуском: pg_dump бэкап БД.
//
// Шаги:
//   0. Создать sequence student_number_seq и привязать к Student.studentNumber
//   1. Создать 5 ServiceType (IND_N, IND_A, IND_LFK, PAIR, GROUP)
//   2. Заполнить Student.studentNumber через ROW_NUMBER
//   3. Скопировать Student.hourlyRate → StudentServicePrice (тип IND_N)
//   4. Заполнить Group.groupType по числу members (1=INDIVIDUAL, 2=PAIR, 3+=GROUP)
//   5. Заполнить ScheduleSlot.serviceTypeId + frozenPrice по правилам
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import * as dotenv from "dotenv";

dotenv.config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DEFAULT_SERVICES = [
  { code: "IND_N", name: "Индивид Н", kind: "INDIVIDUAL", sortOrder: 1 },
  { code: "IND_A", name: "Индивид А", kind: "INDIVIDUAL", sortOrder: 2 },
  { code: "IND_LFK", name: "Инд ЛФК", kind: "INDIVIDUAL", sortOrder: 3 },
  { code: "PAIR", name: "Пара", kind: "PAIR", sortOrder: 4 },
  { code: "GROUP", name: "Группа", kind: "GROUP", sortOrder: 5 },
];

async function step0_CreateSequence() {
  console.log("[0] sequence student_number_seq");
  await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS student_number_seq;`);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Student" ALTER COLUMN "studentNumber" SET DEFAULT nextval('student_number_seq');`,
  );
}

async function step1_SeedServiceTypes() {
  console.log("[1] seed ServiceType");
  for (const svc of DEFAULT_SERVICES) {
    await prisma.serviceType.upsert({
      where: { code: svc.code },
      create: svc,
      update: { name: svc.name, kind: svc.kind, sortOrder: svc.sortOrder },
    });
  }
}

async function step2_FillStudentNumbers() {
  console.log("[2] fill studentNumber");
  await prisma.$executeRawUnsafe(`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id) AS rn
      FROM "Student"
      WHERE "studentNumber" IS NULL
    )
    UPDATE "Student" s
    SET "studentNumber" = r.rn + COALESCE((SELECT MAX("studentNumber") FROM "Student"), 0)
    FROM ranked r
    WHERE s.id = r.id;
  `);
  await prisma.$executeRawUnsafe(
    `SELECT setval('student_number_seq', GREATEST(COALESCE((SELECT MAX("studentNumber") FROM "Student"), 0), 1));`,
  );
}

async function step3_CopyHourlyRateToPrices() {
  console.log("[3] copy hourlyRate -> StudentServicePrice (IND_N)");
  const indN = await prisma.serviceType.findUnique({ where: { code: "IND_N" } });
  if (!indN) throw new Error("ServiceType IND_N not found after seed");

  const students = await prisma.student.findMany({
    where: { hourlyRate: { gt: 0 } },
    select: { id: true, hourlyRate: true },
  });
  for (const s of students) {
    await prisma.studentServicePrice.upsert({
      where: { studentId_serviceTypeId: { studentId: s.id, serviceTypeId: indN.id } },
      create: { studentId: s.id, serviceTypeId: indN.id, price: s.hourlyRate },
      update: {},
    });
  }
  console.log(`   migrated ${students.length} students`);
}

async function step4_FillGroupTypes() {
  console.log("[4] fill Group.groupType");
  const groups = await prisma.group.findMany({ include: { members: true } });
  for (const g of groups) {
    if (g.groupType === "INDIVIDUAL" || g.groupType === "PAIR" || g.groupType === "GROUP") {
      // Уже корректно классифицировано (например админом через UI) — не трогаем
      continue;
    }
    const hasName = !!(g.name && g.name.trim().length > 0);
    let next: "INDIVIDUAL" | "PAIR" | "GROUP";
    if (hasName) {
      // Если у группы есть имя — это группа (даже с 2 учениками). Пары идентифицируются составом, не именем.
      next = "GROUP";
    } else if (g.members.length === 1) {
      next = "INDIVIDUAL";
    } else if (g.members.length === 2) {
      next = "PAIR";
    } else {
      next = "GROUP";
    }
    if (g.groupType !== next) {
      await prisma.group.update({ where: { id: g.id }, data: { groupType: next } });
    }
  }
  console.log(`   processed ${groups.length} groups`);
}

async function step5_FillSlots() {
  console.log("[5] fill ScheduleSlot.serviceTypeId + frozenPrice");
  const services = await prisma.serviceType.findMany();
  const byCode = Object.fromEntries(services.map((s) => [s.code, s]));

  const slots = await prisma.scheduleSlot.findMany({
    where: { serviceTypeId: null },
    include: {
      group: { include: { members: true } },
      student: { select: { id: true, hourlyRate: true } },
    },
  });

  let updated = 0;
  for (const slot of slots) {
    let serviceTypeId: string | null = null;
    let frozenPrice: number | null = null;

    if (slot.lessonType === "INDIVIDUAL" && slot.studentId) {
      serviceTypeId = byCode["IND_N"]?.id ?? null;
      const explicit = await prisma.studentServicePrice.findUnique({
        where: { studentId_serviceTypeId: { studentId: slot.studentId, serviceTypeId: serviceTypeId! } },
      });
      frozenPrice = explicit?.price ?? slot.student?.hourlyRate ?? null;
    } else if (slot.groupId && slot.group) {
      const memberCount = slot.group.members.length;
      const code = memberCount === 2 ? "PAIR" : "GROUP";
      serviceTypeId = byCode[code]?.id ?? null;
      if (serviceTypeId && slot.group.members.length) {
        const memberPrices = await prisma.studentServicePrice.findMany({
          where: { serviceTypeId, studentId: { in: slot.group.members.map((m) => m.studentId) } },
          select: { price: true },
        });
        const validPrices = memberPrices.map((p) => p.price).filter((p) => p > 0);
        frozenPrice = validPrices.length
          ? Math.round(validPrices.reduce((s, p) => s + p, 0) / validPrices.length)
          : null;
      }
    }

    if (serviceTypeId) {
      await prisma.scheduleSlot.update({
        where: { id: slot.id },
        data: { serviceTypeId, frozenPrice },
      });
      updated++;
    }
  }
  console.log(`   updated ${updated}/${slots.length} slots`);
}

async function main() {
  console.log("=== Migration: services v1 ===");
  await step0_CreateSequence();
  await step1_SeedServiceTypes();
  await step2_FillStudentNumbers();
  await step3_CopyHourlyRateToPrices();
  await step4_FillGroupTypes();
  await step5_FillSlots();
  console.log("=== DONE ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
