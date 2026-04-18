import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// GET /api/branches
export async function GET() {
  try {
    const branches = await prisma.branch.findMany({
      where: { isActive: true },
      include: {
        _count: { select: { teachers: true, students: true, groups: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(branches);
  } catch (error) {
    console.error("Ошибка:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// POST /api/branches
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, address, phone } = body;

    if (!name) {
      return NextResponse.json({ error: "Название обязательно" }, { status: 400 });
    }

    const branch = await prisma.branch.create({
      data: { name, address: address || null, phone: phone || null },
    });

    await logAudit({ entityType: "Branch", entityId: branch.id, action: "CREATE" });

    return NextResponse.json(branch, { status: 201 });
  } catch (error) {
    console.error("Ошибка:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
