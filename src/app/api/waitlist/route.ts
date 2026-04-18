import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// GET /api/waitlist
export async function GET() {
  try {
    const entries = await prisma.waitlistEntry.findMany({
      where: { status: { in: ["WAITING", "TRIAL"] } },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(entries);
  } catch (error) {
    console.error("Ошибка:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// POST /api/waitlist — добавить в лист ожидания
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      childName, age, parentName, parentPhone, direction,
      preferredDays, preferredTime, preferredTeacher, branchId,
      level, specialNeeds, source, priority, probability, note,
    } = body;

    if (!childName) {
      return NextResponse.json({ error: "ФИО ребёнка обязательно" }, { status: 400 });
    }

    const entry = await prisma.waitlistEntry.create({
      data: {
        childName,
        age: age ? parseInt(String(age), 10) : null,
        parentName: parentName || null,
        parentPhone: parentPhone || null,
        direction: direction || null,
        preferredDays: preferredDays || null,
        preferredTime: preferredTime || null,
        preferredTeacher: preferredTeacher || null,
        branchId: branchId || null,
        level: level || null,
        specialNeeds: specialNeeds || null,
        source: source || null,
        priority: priority || "WARM",
        probability: probability ? parseInt(String(probability), 10) : null,
        note: note || null,
      },
    });

    await logAudit({ entityType: "WaitlistEntry", entityId: entry.id, action: "CREATE" });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("Ошибка:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// PATCH /api/waitlist?id=xxx — обновить статус (перевод в ученики и т.д.)
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id обязателен" }, { status: 400 });

    const body = await request.json();
    const { status, convertedStudentId } = body;

    const entry = await prisma.waitlistEntry.update({
      where: { id },
      data: {
        status: status || undefined,
        convertedStudentId: convertedStudentId || undefined,
      },
    });

    await logAudit({ entityType: "WaitlistEntry", entityId: id, action: "UPDATE", changes: { status: { old: null, new: status } } });

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Ошибка:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// DELETE /api/waitlist?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id обязателен" }, { status: 400 });

    await prisma.waitlistEntry.delete({ where: { id } });
    await logAudit({ entityType: "WaitlistEntry", entityId: id, action: "DELETE" });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Ошибка:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
