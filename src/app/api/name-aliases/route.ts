import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/name-aliases — все сохранённые псевдонимы
export async function GET() {
  const aliases = await prisma.nameAlias.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(aliases);
}

// POST /api/name-aliases — сохранить/обновить псевдонимы
// Body: { aliases: { alias: string, type: string, entityId: string }[] }
export async function POST(request: NextRequest) {
  try {
    const { aliases } = await request.json();

    if (!Array.isArray(aliases) || aliases.length === 0) {
      return NextResponse.json({ error: "aliases обязателен" }, { status: 400 });
    }

    let saved = 0;
    for (const a of aliases as { alias: string; type: string; entityId: string }[]) {
      if (!a.alias || !a.type || !a.entityId) continue;
      await prisma.nameAlias.upsert({
        where: { alias_type: { alias: a.alias, type: a.type } },
        create: { alias: a.alias, type: a.type, entityId: a.entityId },
        update: { entityId: a.entityId },
      });
      saved++;
    }

    return NextResponse.json({ saved });
  } catch (error) {
    console.error("Ошибка сохранения псевдонимов:", error);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}
