import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireRole, isUser } from "@/lib/auth-utils";

// PUT /api/students/prices — проставить цены сразу многим детям.
// Body: { items: [{ studentId, serviceTypeId, price }] }
// Цена 0 или пусто — цену убираем. Каждое изменение пишем в историю тарифов,
// как это делает карточка ученика.
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireRole("ADMIN", "DIRECTOR");
    if (!isUser(auth)) return auth;

    const body = await request.json();
    type PriceItem = { studentId: string; serviceTypeId: string; price: unknown };
    const items: PriceItem[] = Array.isArray(body?.items) ? (body.items as PriceItem[]) : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "Нечего сохранять" }, { status: 400 });
    }
    if (items.length > 500) {
      return NextResponse.json({ error: "Слишком много строк за раз" }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0];
    const studentIds: string[] = [...new Set(items.map((i) => i.studentId))];
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, tariffType: true },
    });
    const tariffOf = new Map(students.map((s) => [s.id, s.tariffType]));

    let saved = 0;
    let removed = 0;

    for (const item of items) {
      if (!item?.studentId || !item?.serviceTypeId) continue;
      if (!tariffOf.has(item.studentId)) continue;

      const price = Number.parseInt(String(item.price ?? 0), 10) || 0;
      const existing = await prisma.studentServicePrice.findUnique({
        where: { studentId_serviceTypeId: { studentId: item.studentId, serviceTypeId: item.serviceTypeId } },
      });

      if (price <= 0) {
        if (existing) {
          await prisma.studentServicePrice.delete({ where: { id: existing.id } });
          removed++;
        }
        continue;
      }
      if (existing && existing.price === price) continue;

      await prisma.studentServicePrice.upsert({
        where: { studentId_serviceTypeId: { studentId: item.studentId, serviceTypeId: item.serviceTypeId } },
        create: { studentId: item.studentId, serviceTypeId: item.serviceTypeId, price },
        update: { price },
      });
      await prisma.tariffHistory.create({
        data: {
          studentId: item.studentId,
          hourlyRate: price,
          tariffType: tariffOf.get(item.studentId) ?? "PER_LESSON",
          serviceTypeId: item.serviceTypeId,
          servicePrice: price,
          effectiveFrom: today,
        },
      });
      saved++;
    }

    for (const studentId of studentIds) {
      await logAudit({ entityType: "Student", entityId: studentId, action: "UPDATE", userId: auth.id });
    }

    return NextResponse.json({ saved, removed });
  } catch (error) {
    console.error("Не удалось сохранить цены:", error);
    return NextResponse.json({ error: "Не удалось сохранить цены" }, { status: 500 });
  }
}
