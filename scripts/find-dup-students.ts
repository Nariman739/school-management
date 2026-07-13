import * as dotenv from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
dotenv.config();
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "").trim();
(async () => {
  const students = await prisma.student.findMany();
  const byName = new Map<string, typeof students>();
  for (const s of students) {
    const k = `${norm(s.lastName)}|${norm(s.firstName)}`;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k)!.push(s);
  }
  const dups = [...byName.entries()].filter(([, arr]) => arr.length > 1);
  console.log(`Дубль-групп (точное совпадение Фамилия+Имя): ${dups.length}\n`);
  for (const [, arr] of dups) {
    console.log(`━━ ${arr[0].lastName} ${arr[0].firstName} (${arr.length} шт) ━━`);
    for (const s of arr) {
      const [slots, att, prices, pay, gm, attend2] = await Promise.all([
        prisma.scheduleSlot.count({ where: { studentId: s.id } }),
        prisma.attendance.count({ where: { studentId: s.id } }),
        prisma.studentServicePrice.count({ where: { studentId: s.id } }),
        prisma.payment.count({ where: { studentId: s.id } }),
        prisma.groupMember.count({ where: { studentId: s.id } }),
        prisma.slotAttendee.count({ where: { studentId: s.id } }),
      ]);
      const refs = slots+att+prices+pay+gm+attend2;
      console.log(`   #${s.studentNumber ?? "—"} active=${s.isActive} создан=${s.createdAt.toISOString().slice(0,10)} | слотов=${slots} посещ=${att} цен=${prices} оплат=${pay} групп=${gm} slotAtt=${attend2} → ВСЕГО ссылок ${refs}  [id ${s.id.slice(0,8)}]`);
    }
    console.log();
  }
  await prisma.$disconnect();
})();
