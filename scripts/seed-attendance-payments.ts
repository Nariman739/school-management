import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import dotenv from 'dotenv';

dotenv.config();
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function main() {
  const WEEK = '2026-04-14';
  const DAYS = [
    { day: 1, date: '2026-04-14' }, // Mon
    { day: 2, date: '2026-04-15' }, // Tue
    { day: 3, date: '2026-04-16' }, // Wed
  ];

  const slots = await prisma.scheduleSlot.findMany({
    where: { weekStartDate: WEEK },
    include: {
      student: true,
      group: { include: { members: { include: { student: true } } } },
    },
  });

  console.log(`Found ${slots.length} slots for week ${WEEK}`);

  let attCount = 0;
  const STATUSES = ['ATTENDED', 'ATTENDED', 'ATTENDED', 'ATTENDED', 'ATTENDED', 'ATTENDED', 'ATTENDED', 'ABSENT_NO_REASON', 'ABSENT_NO_REASON', 'SICK'];

  for (const dayInfo of DAYS) {
    const daySlots = slots.filter((s: any) => s.dayOfWeek === dayInfo.day);
    console.log(`${dayInfo.date}: ${daySlots.length} slots`);

    for (const slot of daySlots) {
      let studentIds: string[] = [];

      if (slot.lessonType === 'INDIVIDUAL' && slot.studentId) {
        studentIds = [slot.studentId];
      } else if (slot.group && slot.group.members.length > 0) {
        studentIds = slot.group.members.map((m: any) => m.student.id);
      }

      for (const studentId of studentIds) {
        const status = pick(STATUSES);
        try {
          await prisma.attendance.create({
            data: {
              scheduleSlotId: slot.id,
              studentId,
              date: dayInfo.date,
              status,
              isPresent: status === 'ATTENDED',
              markedAt: new Date(),
            },
          });
          attCount++;
        } catch (e: any) {
          // skip duplicates
        }
      }
    }
  }

  console.log(`Created ${attCount} attendance records`);

  // Payments
  const students = await prisma.student.findMany({ where: { isActive: true } });
  const paymentCount = 18;
  let payCount = 0;

  for (let i = 0; i < paymentCount; i++) {
    const student = pick(students);
    const amount = randInt(20, 80) * 1000;
    const day = randInt(1, 18);
    await prisma.payment.create({
      data: {
        studentId: student.id,
        amount,
        date: `2026-04-${String(day).padStart(2, '0')}`,
        note: 'Оплата за апрель',
      },
    });
    payCount++;
  }

  console.log(`Created ${payCount} payments`);
  console.log('Done!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
