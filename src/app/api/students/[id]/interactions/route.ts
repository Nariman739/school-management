import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/students/[id]/interactions — история CRM
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const interactions = await prisma.parentInteraction.findMany({
      where: { studentId: id },
      orderBy: { date: "desc" },
      take: 50,
    });

    return NextResponse.json(interactions);
  } catch (error) {
    console.error("Ошибка:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

// POST /api/students/[id]/interactions — добавить запись CRM
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { type, date, note, promisedPayDate, promisedAmount } = body;

    if (!type || !date || !note) {
      return NextResponse.json(
        { error: "type, date и note обязательны" },
        { status: 400 }
      );
    }

    const interaction = await prisma.parentInteraction.create({
      data: {
        studentId: id,
        type,
        date,
        note,
        promisedPayDate: promisedPayDate || null,
        promisedAmount: promisedAmount ? parseInt(String(promisedAmount), 10) : null,
      },
    });

    return NextResponse.json(interaction, { status: 201 });
  } catch (error) {
    console.error("Ошибка:", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
