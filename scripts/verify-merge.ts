import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
(async () => {
  const total = await prisma.student.count();
  const active = await prisma.student.count({ where: { isActive: true } });
  console.log(`Учеников всего: ${total} (активных ${active})`);
  const nums = [115,116,117,118,120];
  for (const n of nums) {
    const s = await prisma.student.findFirst({ where: { studentNumber: n } });
    if (!s) { console.log(`#${n}: не найден`); continue; }
    const [slots, att, prices, pay, gm] = await Promise.all([
      prisma.scheduleSlot.count({ where: { studentId: s.id } }),
      prisma.attendance.count({ where: { studentId: s.id } }),
      prisma.studentServicePrice.count({ where: { studentId: s.id } }),
      prisma.payment.count({ where: { studentId: s.id } }),
      prisma.groupMember.count({ where: { studentId: s.id } }),
    ]);
    console.log(`#${n} ${s.lastName} ${s.firstName} active=${s.isActive} | слотов=${slots} посещ=${att} цен=${prices} оплат=${pay} групп=${gm}`);
  }
  // Проверка целостности: слоты без существующего ученика (orphans)
  const orphanSlots = await prisma.scheduleSlot.count({ where: { studentId: { not: null }, student: { is: null } } });
  console.log(`\nОрфан-слотов (studentId указывает в никуда): ${orphanSlots}`);
  await prisma.$disconnect();
})();
