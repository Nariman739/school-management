import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireRole, isUser } from "@/lib/auth-utils";

const ALLOWED_KIND = ["INDIVIDUAL", "PAIR", "GROUP"] as const;

export async function GET() {
  try {
    const services = await prisma.serviceType.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(services);
  } catch (error) {
    console.error("Failed to fetch services:", error);
    return NextResponse.json({ error: "Не удалось загрузить типы услуг" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole("ADMIN", "DIRECTOR");
    if (!isUser(auth)) return auth;

    const body = await request.json();
    const { code, name, kind, sortOrder, isActive } = body;

    if (!code || !name || !kind) {
      return NextResponse.json({ error: "Поля code, name и kind обязательны" }, { status: 400 });
    }
    if (!ALLOWED_KIND.includes(kind)) {
      return NextResponse.json(
        { error: `Поле kind должно быть одним из: ${ALLOWED_KIND.join(", ")}` },
        { status: 400 },
      );
    }

    const service = await prisma.serviceType.create({
      data: {
        code: String(code).trim(),
        name: String(name).trim(),
        kind,
        sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
        isActive: typeof isActive === "boolean" ? isActive : true,
      },
    });

    await logAudit({ entityType: "ServiceType", entityId: service.id, action: "CREATE", userId: auth.id });
    return NextResponse.json(service, { status: 201 });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Услуга с таким кодом уже существует" }, { status: 409 });
    }
    console.error("Failed to create service:", error);
    return NextResponse.json({ error: "Не удалось создать тип услуги" }, { status: 500 });
  }
}
