import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getParentPayStatuses } from "@/lib/billing-rules";
import { resolveSlotPriceForStudent } from "@/lib/pricing";

type ServiceBreakdown = {
  serviceTypeId: string | null;
  serviceName: string;
  hours: number;
  amount: number;
};

type BillingEntry = {
  studentId: string;
  studentNumber: number | null;
  studentName: string;
  parentName: string;
  parentPhone: string;
  hourlyRate: number;
  totalHours: number;
  totalAmount: number;
  byService: ServiceBreakdown[];
  details: {
    day: number;
    time: string;
    teacherName: string;
    type: string;
    serviceName: string | null;
    price: number;
    status: string;
  }[];
};

// GET /api/reports/billing?weekStart=2025-01-20
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get("weekStart");

    if (!weekStart) {
      return NextResponse.json(
        { error: "weekStart обязателен" },
        { status: 400 }
      );
    }

    const slots = await prisma.scheduleSlot.findMany({
      where: { weekStartDate: weekStart },
      include: {
        teacher: true,
        student: true,
        group: {
          include: { members: { include: { student: true } } },
        },
        serviceType: true,
        attendances: {
          where: { status: { in: getParentPayStatuses() } },
          include: { student: true },
        },
      },
    });

    const weekDates = new Map<number, string>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      weekDates.set(i + 1, d.toISOString().split("T")[0]);
    }

    const billingMap = new Map<string, BillingEntry>();

    for (const slot of slots) {
      const dateForDay = weekDates.get(slot.dayOfWeek) || "";

      for (const attendance of slot.attendances) {
        if (attendance.date !== dateForDay) continue;

        const student = attendance.student;
        const price = await resolveSlotPriceForStudent(slot, student.id, student.hourlyRate);

        if (!billingMap.has(student.id)) {
          billingMap.set(student.id, {
            studentId: student.id,
            studentNumber: student.studentNumber ?? null,
            studentName: `${student.lastName} ${student.firstName}`,
            parentName: student.parentName || "—",
            parentPhone: student.parentPhone || "—",
            hourlyRate: student.hourlyRate,
            totalHours: 0,
            totalAmount: 0,
            byService: [],
            details: [],
          });
        }

        const entry = billingMap.get(student.id)!;
        entry.totalHours += 1;
        entry.totalAmount += price;

        const serviceKey = slot.serviceTypeId ?? "__legacy__";
        const serviceName = slot.serviceType?.name ?? "Без типа услуги";
        let bucket = entry.byService.find((b) => (b.serviceTypeId ?? "__legacy__") === serviceKey);
        if (!bucket) {
          bucket = { serviceTypeId: slot.serviceTypeId, serviceName, hours: 0, amount: 0 };
          entry.byService.push(bucket);
        }
        bucket.hours += 1;
        bucket.amount += price;

        entry.details.push({
          day: slot.dayOfWeek,
          time: slot.startTime,
          teacherName: `${slot.teacher.lastName} ${slot.teacher.firstName}`,
          type: slot.lessonType,
          serviceName: slot.serviceType?.name ?? null,
          price,
          status: attendance.status,
        });
      }
    }

    const result = Array.from(billingMap.values()).sort((a, b) =>
      a.studentName.localeCompare(b.studentName)
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Ошибка при расчёте счёта:", error);
    return NextResponse.json(
      { error: "Не удалось рассчитать счёт" },
      { status: 500 }
    );
  }
}
