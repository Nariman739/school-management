import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { suggestStudentMatches } from "@/lib/import-utils";

// GET /api/students — list all active students
export async function GET() {
  try {
    const students = await prisma.student.findMany({
      where: { isActive: true },
      orderBy: [{ studentNumber: "asc" }, { lastName: "asc" }],
    });
    return NextResponse.json(students);
  } catch (error) {
    console.error("Failed to fetch students:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить список учеников" },
      { status: 500 }
    );
  }
}

async function nextStudentNumber(): Promise<number> {
  // Пытаемся через sequence (создан миграционным скриптом). Если sequence нет — fallback на MAX+1
  try {
    const rows = await prisma.$queryRawUnsafe<{ nextval: bigint }[]>(
      `SELECT nextval('student_number_seq') AS nextval;`,
    );
    const v = rows?.[0]?.nextval;
    if (typeof v === "bigint") return Number(v);
    if (typeof v === "number") return v;
  } catch {
    // sequence ещё не создан — fallback
  }
  const agg = await prisma.student.aggregate({ _max: { studentNumber: true } });
  return (agg._max.studentNumber ?? 0) + 1;
}

// POST /api/students — create a new student
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      lastName,
      firstName,
      patronymic,
      parentName,
      parentPhone,
      hourlyRate,
      prices,
    }: {
      lastName?: string;
      firstName?: string;
      patronymic?: string;
      parentName?: string;
      parentPhone?: string;
      hourlyRate?: string | number;
      prices?: { serviceTypeId: string; price: number | string }[];
    } = body;

    if (!lastName || !firstName) {
      return NextResponse.json(
        { error: "Фамилия и имя обязательны для заполнения" },
        { status: 400 }
      );
    }

    // Дедуп-предохранитель: не даём молча плодить копии уже существующих учеников
    // (Дархан так наплодил дубли Алинур/Айдана/…). Если есть очень близкий активный
    // ученик и клиент не подтвердил force — возвращаем кандидатов, UI переспросит.
    const force = body?.force === true;
    if (!force) {
      const active = await prisma.student.findMany({
        where: { isActive: true },
        select: { id: true, lastName: true, firstName: true, studentNumber: true },
      });
      const nearDupes = suggestStudentMatches(`${lastName} ${firstName}`, active, 5).filter(
        (s) => s.distance <= 2,
      );
      if (nearDupes.length > 0) {
        return NextResponse.json(
          {
            error: "Возможно, такой ученик уже есть",
            code: "POSSIBLE_DUPLICATE",
            candidates: nearDupes.map((s) => ({ id: s.id, label: s.label })),
          },
          { status: 409 },
        );
      }
    }

    const studentNumber = await nextStudentNumber();

    const student = await prisma.student.create({
      data: {
        studentNumber,
        lastName,
        firstName,
        patronymic: patronymic || null,
        parentName: parentName || null,
        parentPhone: parentPhone || null,
        hourlyRate: hourlyRate ? parseInt(String(hourlyRate), 10) : 0,
      },
    });

    if (Array.isArray(prices) && prices.length) {
      for (const p of prices) {
        if (!p?.serviceTypeId) continue;
        const price = Number.parseInt(String(p.price ?? 0), 10) || 0;
        if (price <= 0) continue;
        await prisma.studentServicePrice.create({
          data: { studentId: student.id, serviceTypeId: p.serviceTypeId, price },
        });
      }
    }

    await logAudit({ entityType: "Student", entityId: student.id, action: "CREATE" });

    return NextResponse.json(student, { status: 201 });
  } catch (error) {
    console.error("Failed to create student:", error);
    return NextResponse.json(
      { error: "Не удалось создать ученика" },
      { status: 500 }
    );
  }
}
