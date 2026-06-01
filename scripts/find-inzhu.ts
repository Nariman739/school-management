import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config();
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const teachers = await prisma.teacher.findMany({
    select: { id: true, firstName: true, lastName: true, patronymic: true, createdAt: true },
  });
  // Все Инжу/Анжу/Ынжу
  const candidates = teachers.filter((t) =>
    /инж|анж|ынж|жу|мейрам/i.test(`${t.firstName} ${t.lastName} ${t.patronymic ?? ""}`)
  );
  console.log("Кандидаты (по подстрокам инж/анж/ынж/жу/мейрам):");
  for (const t of candidates) {
    console.log(`  id=${t.id}`);
    console.log(`     ФИО: "${t.lastName}" "${t.firstName}" "${t.patronymic ?? ""}"`);
    console.log(`     created: ${t.createdAt.toISOString()}`);
  }
}
main().finally(() => prisma.$disconnect());
