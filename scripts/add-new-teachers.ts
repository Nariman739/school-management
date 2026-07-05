import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
async function main() {
  const news = [
    { firstName: "Ирина", patronymic: "Генадиевна" },
    { firstName: "Асем", patronymic: "С" },
    { firstName: "Алтынгуль", patronymic: null, lastName: "Кенжебек" },
    { firstName: "Алина", patronymic: null },
  ];
  const existing = await prisma.teacher.findMany({ where: { isActive: true }, select: { firstName: true, lastName: true, patronymic: true } });
  const maxRow = await prisma.$queryRawUnsafe<{ max: number | null }[]>(`SELECT COALESCE(MAX("teacherNumber"), 0) AS max FROM "Teacher";`);
  let next = Number(maxRow[0]?.max ?? 0) + 1;
  for (const t of news) {
    const dup = existing.find((e) => e.firstName === t.firstName && (e.lastName === (t.lastName ?? "") || (!t.lastName && !e.lastName)));
    if (dup) { console.log(`Уже есть: ${t.firstName}`); continue; }
    await prisma.teacher.create({
      data: { firstName: t.firstName, lastName: t.lastName ?? "", patronymic: t.patronymic, teacherNumber: next },
    });
    console.log(`✓ #${next} ${t.lastName ?? ""} ${t.firstName} ${t.patronymic ?? ""}`);
    next++;
  }
  await prisma.$executeRawUnsafe(`SELECT setval('teacher_number_seq', $1, true);`, next - 1);
}
main().finally(() => prisma.$disconnect());
