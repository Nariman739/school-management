import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
async function main() {
  // 1. Sequence status
  const seq: any = await prisma.$queryRawUnsafe(`SELECT last_value FROM student_number_seq;`);
  console.log(`Sequence next: следующий будет #${Number(seq[0].last_value) + 1}`);

  // 2. Активные с номерами / без
  const active = await prisma.student.count({ where: { isActive: true } });
  const withNum = await prisma.student.count({ where: { isActive: true, studentNumber: { not: null } } });
  const inactive = await prisma.student.count({ where: { isActive: false } });
  const inactiveWithNum = await prisma.student.count({ where: { isActive: false, studentNumber: { not: null } } });
  console.log(`\nАктивные ученики: ${withNum}/${active} с ID`);
  console.log(`Неактивные (ушли): ${inactiveWithNum}/${inactive} с ID (номера ЗА ними закреплены)`);

  // 3. Максимальный номер
  const maxRow: any = await prisma.$queryRawUnsafe(`SELECT MAX("studentNumber") as max FROM "Student";`);
  console.log(`\nПоследний использованный ID: #${maxRow[0].max}`);

  // 4. Пропуски в нумерации (это где неоднозначные, они без номера)
  const nums = await prisma.student.findMany({ select: { studentNumber: true } });
  const set = new Set(nums.map((n) => n.studentNumber).filter((n): n is number => n !== null));
  const gaps: number[] = [];
  for (let i = 1; i <= maxRow[0].max; i++) if (!set.has(i)) gaps.push(i);
  console.log(`Пропуски в нумерации: ${gaps.length > 0 ? gaps.join(", ") : "нет"}`);

  // 5. Педагоги
  const tActive = await prisma.teacher.count({ where: { isActive: true } });
  const tWithNum = await prisma.teacher.count({ where: { isActive: true, teacherNumber: { not: null } } });
  console.log(`\nАктивные педагоги: ${tWithNum}/${tActive} с ID`);
  const seqT: any = await prisma.$queryRawUnsafe(`SELECT last_value FROM teacher_number_seq;`);
  console.log(`Sequence next: #${Number(seqT[0].last_value) + 1}`);
}
main().finally(() => prisma.$disconnect());
