// Добавляет 4 педагогов, которые есть в Excel Дархана, но отсутствуют в БД.
// Фамилии неизвестны — ставим пустую строку (Дархан дополнит в карточке учителя).
// Запуск: npx tsx scripts/add-missing-teachers.ts

import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

dotenv.config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// firstName, patronymic
const TEACHERS = [
  { firstName: "Алена", patronymic: "Васильевна" },
  { firstName: "Евгения", patronymic: "Ивановна" },
  { firstName: "Инжу", patronymic: "Мейрамгалиевна" },
  { firstName: "Тамира", patronymic: "Даулетовна" },
];

async function main() {
  for (const t of TEACHERS) {
    // Проверяем — может уже добавили
    const existing = await prisma.teacher.findFirst({
      where: {
        firstName: t.firstName,
        patronymic: t.patronymic,
      },
    });
    if (existing) {
      console.log(`✓ Уже есть: ${t.firstName} ${t.patronymic}`);
      continue;
    }

    const created = await prisma.teacher.create({
      data: {
        firstName: t.firstName,
        patronymic: t.patronymic,
        lastName: "", // Дархан дополнит позже
      },
    });
    console.log(`+ Добавлен: ${created.firstName} ${created.patronymic} (id=${created.id})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
