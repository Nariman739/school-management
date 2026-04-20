/**
 * Seed demo data: schedule slots, attendance, payments
 * Run: npx tsx scripts/seed-demo-data.ts
 */

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// --- Helpers ---

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// --- Main ---

async function main() {
  console.log('Fetching existing data...');

  const [teachers, students, groups] = await Promise.all([
    prisma.teacher.findMany(),
    prisma.student.findMany(),
    prisma.group.findMany({ include: { members: { include: { student: true } } } }),
  ]);

  console.log(`Found: ${teachers.length} teachers, ${students.length} students, ${groups.length} groups`);

  if (teachers.length === 0 || students.length === 0) {
    console.error('No teachers or students in DB. Seed them first.');
    return;
  }

  const WEEK_START = '2026-04-14';
  const DAYS = [1, 2, 3, 4, 5]; // Mon-Fri
  const TIME_SLOTS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];
  const CATEGORIES = ['А', 'И', 'Тех', 'СОПР', 'МНО'];
  const ROOMS = ['101', '102', '103', '104', '105', '201', '202', '203'];

  // Pick 10-15 active teachers for the week
  const activeTeacherCount = randInt(10, 15);
  const activeTeachers = pickN(teachers, Math.min(activeTeacherCount, teachers.length));
  console.log(`Selected ${activeTeachers.length} active teachers for the week`);

  // ========== 1. SCHEDULE SLOTS ==========
  console.log('\nCreating schedule slots...');

  type SlotData = {
    teacherId: string;
    studentId: string | null;
    groupId: string | null;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    weekStartDate: Date;
    lessonType: 'INDIVIDUAL' | 'GROUP';
    lessonCategory: string;
    room: string;
  };

  const slotsToCreate: SlotData[] = [];

  for (const teacher of activeTeachers) {
    // Each teacher gets slots on random days
    const teacherDays = pickN(DAYS, randInt(3, 5));

    for (const day of teacherDays) {
      // 4-6 slots per day for this teacher
      const slotCount = randInt(4, 6);
      const dayTimes = pickN(TIME_SLOTS, Math.min(slotCount, TIME_SLOTS.length));

      for (const startTime of dayTimes) {
        const startHour = parseInt(startTime.split(':')[0]);
        const endTime = `${String(startHour + 1).padStart(2, '0')}:00`;

        // 60% individual, 40% group
        const isIndividual = Math.random() < 0.6;

        let studentId: string | null = null;
        let groupId: string | null = null;

        if (isIndividual) {
          studentId = pick(students).id;
        } else if (groups.length > 0) {
          groupId = pick(groups).id;
        } else {
          studentId = pick(students).id;
        }

        slotsToCreate.push({
          teacherId: teacher.id,
          studentId,
          groupId,
          dayOfWeek: day,
          startTime,
          endTime,
          weekStartDate: WEEK_START,
          lessonType: isIndividual ? 'INDIVIDUAL' : 'GROUP',
          lessonCategory: pick(CATEGORIES),
          room: pick(ROOMS),
        });
      }
    }
  }

  // Trim to 50-60 if we generated more
  const targetSlots = randInt(50, 60);
  const finalSlots = slotsToCreate.length > targetSlots
    ? pickN(slotsToCreate, targetSlots)
    : slotsToCreate;

  // Create all slots
  const createdSlots = [];
  for (const slot of finalSlots) {
    const created = await prisma.scheduleSlot.create({ data: slot });
    createdSlots.push(created);
  }

  console.log(`Created ${createdSlots.length} schedule slots`);

  // Summarize by day
  for (const day of DAYS) {
    const daySlots = createdSlots.filter((s: any) => s.dayOfWeek === day);
    const dayName = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт'][day];
    const indiv = daySlots.filter((s: any) => s.lessonType === 'INDIVIDUAL').length;
    const group = daySlots.filter((s: any) => s.lessonType === 'GROUP').length;
    console.log(`  ${dayName}: ${daySlots.length} slots (${indiv} individual, ${group} group)`);
  }

  // ========== 2. ATTENDANCE ==========
  console.log('\nCreating attendance records...');

  const ATTENDANCE_DAYS = [
    { day: 1, date: '2026-04-14' }, // Mon
    { day: 2, date: '2026-04-15' }, // Tue
    { day: 3, date: '2026-04-16' }, // Wed
  ];

  const STATUSES = ['ATTENDED', 'ABSENT_NO_REASON', 'SICK', 'ABSENT_VALID_REASON'] as const;
  const STATUS_WEIGHTS = [70, 15, 10, 5]; // percentages

  let attendanceCount = 0;

  for (const { day, date } of ATTENDANCE_DAYS) {
    const daySlots = createdSlots.filter((s: any) => s.dayOfWeek === day);

    for (const slot of daySlots) {
      // Determine which students to create attendance for
      let slotStudentIds: string[] = [];

      if ((slot as any).lessonType === 'INDIVIDUAL' && (slot as any).studentId) {
        slotStudentIds = [(slot as any).studentId];
      } else if ((slot as any).groupId) {
        // Find group students
        const group = groups.find(g => g.id === (slot as any).groupId);
        if (group && group.members && group.members.length > 0) {
          slotStudentIds = group.members.map((m: any) => m.student.id);
        } else {
          // Fallback: assign 3-5 random students
          slotStudentIds = pickN(students, randInt(3, 5)).map(s => s.id);
        }
      }

      for (const sid of slotStudentIds) {
        const status = weightedPick([...STATUSES], STATUS_WEIGHTS);
        const isPresent = status === 'ATTENDED';

        await prisma.attendance.create({
          data: {
            scheduleSlotId: slot.id,
            studentId: sid,
            date: date,
            status,
            isPresent,
          },
        });
        attendanceCount++;
      }
    }
  }

  console.log(`Created ${attendanceCount} attendance records`);

  for (const { day, date } of ATTENDANCE_DAYS) {
    const dayName = ['', 'Пн', 'Вт', 'Ср'][day];
    const daySlots = createdSlots.filter((s: any) => s.dayOfWeek === day);
    console.log(`  ${dayName} (${date}): ${daySlots.length} slots`);
  }

  // ========== 3. PAYMENTS ==========
  console.log('\nCreating payments...');

  const paymentCount = randInt(15, 20);
  const paymentStudents = pickN(students, paymentCount);

  let totalPayments = 0;

  for (const student of paymentStudents) {
    const amount = randInt(20, 80) * 1000; // 20000-80000, rounded to thousands
    const dayOfMonth = randInt(1, 17); // April 1-17

    await prisma.payment.create({
      data: {
        studentId: student.id,
        amount,
        date: `2026-04-${String(dayOfMonth).padStart(2, '0')}`,
        note: 'Оплата за апрель',
      },
    });
    totalPayments += amount;
  }

  console.log(`Created ${paymentCount} payments, total: ${totalPayments.toLocaleString()} тг`);

  // ========== SUMMARY ==========
  console.log('\n========== SUMMARY ==========');
  console.log(`Schedule slots: ${createdSlots.length}`);
  console.log(`Attendance records: ${attendanceCount}`);
  console.log(`Payments: ${paymentCount}`);
  console.log('Week: 2026-04-14 — 2026-04-18');
  console.log('Attendance days: Mon, Tue, Wed');
  console.log('=============================\n');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
