// Запуск: npx tsx scripts/seed-admin.ts
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { hash } from "bcryptjs";
import * as dotenv from "dotenv";

dotenv.config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = "admin@school.kz";
  const password = "admin123";
  const name = "Администратор";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Юзер ${email} уже существует (id: ${existing.id})`);
    return;
  }

  const passwordHash = await hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      role: "ADMIN",
    },
  });

  console.log(`Создан admin: ${user.email} / ${password}`);
  console.log(`ID: ${user.id}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
