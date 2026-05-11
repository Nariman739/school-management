import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireRole, isUser } from "@/lib/auth-utils";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const prices = await prisma.studentServicePrice.findMany({
      where: { studentId: id },
      include: { serviceType: true },
    });
    return NextResponse.json(prices);
  } catch (error) {
    console.error("Failed to fetch student prices:", error);
    return NextResponse.json({ error: "Не удалось загрузить цены ученика" }, { status: 500 });
  }
}

// PUT принимает массив цен — апплицирует диффом:
// - price > 0 → upsert
// - price <= 0 / null → delete
type PriceInput = { serviceTypeId: string; price: number | string | null };

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireRole("ADMIN", "DIRECTOR");
    if (!isUser(auth)) return auth;

    const { id } = await params;
    const body = await request.json();
    const items: PriceInput[] = Array.isArray(body?.prices) ? body.prices : [];

    const student = await prisma.student.findUnique({ where: { id } });
    if (!student) return NextResponse.json({ error: "Ученик не найден" }, { status: 404 });

    const today = new Date().toISOString().split("T")[0];

    for (const item of items) {
      if (!item?.serviceTypeId) continue;
      const price = Number.parseInt(String(item.price ?? 0), 10) || 0;

      const existing = await prisma.studentServicePrice.findUnique({
        where: { studentId_serviceTypeId: { studentId: id, serviceTypeId: item.serviceTypeId } },
      });

      if (price <= 0) {
        if (existing) {
          await prisma.studentServicePrice.delete({ where: { id: existing.id } });
          await prisma.tariffHistory.create({
            data: {
              studentId: id,
              hourlyRate: 0,
              tariffType: student.tariffType,
              serviceTypeId: item.serviceTypeId,
              servicePrice: 0,
              effectiveFrom: today,
            },
          });
        }
        continue;
      }

      if (existing && existing.price === price) continue;

      await prisma.studentServicePrice.upsert({
        where: { studentId_serviceTypeId: { studentId: id, serviceTypeId: item.serviceTypeId } },
        create: { studentId: id, serviceTypeId: item.serviceTypeId, price },
        update: { price },
      });

      await prisma.tariffHistory.create({
        data: {
          studentId: id,
          hourlyRate: price,
          tariffType: student.tariffType,
          serviceTypeId: item.serviceTypeId,
          servicePrice: price,
          effectiveFrom: today,
        },
      });
    }

    await logAudit({ entityType: "Student", entityId: id, action: "UPDATE", userId: auth.id });

    const fresh = await prisma.studentServicePrice.findMany({
      where: { studentId: id },
      include: { serviceType: true },
    });
    return NextResponse.json(fresh);
  } catch (error) {
    console.error("Failed to update student prices:", error);
    return NextResponse.json({ error: "Не удалось сохранить цены" }, { status: 500 });
  }
}
