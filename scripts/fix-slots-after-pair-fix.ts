// После fix-pair-classification — слоты бывших "пар" получили serviceType=PAIR.
// Переклассифицируем их serviceType на GROUP и пересчитаем frozenPrice.
// Запуск: npx tsx scripts/fix-slots-after-pair-fix.ts
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import * as dotenv from "dotenv";

dotenv.config();

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== Fix slot serviceType after pair-classification fix ===");

  const groupService = await prisma.serviceType.findUnique({ where: { code: "GROUP" } });
  const pairService = await prisma.serviceType.findUnique({ where: { code: "PAIR" } });
  if (!groupService || !pairService) {
    console.error("ServiceType PAIR/GROUP не найдены");
    process.exit(1);
  }

  // Слоты с serviceType=PAIR, но Group у которых сейчас groupType=GROUP
  const slots = await prisma.scheduleSlot.findMany({
    where: {
      serviceTypeId: pairService.id,
      groupId: { not: null },
    },
    include: { group: { include: { members: true } } },
  });

  let migrated = 0;
  for (const slot of slots) {
    if (!slot.group) continue;
    if (slot.group.groupType !== "GROUP") continue;

    // Цена для слота — средняя из StudentServicePrice по типу GROUP
    const memberPrices = await prisma.studentServicePrice.findMany({
      where: {
        serviceTypeId: groupService.id,
        studentId: { in: slot.group.members.map((m) => m.studentId) },
      },
      select: { price: true },
    });
    const valid = memberPrices.map((p) => p.price).filter((p) => p > 0);
    const newPrice = valid.length
      ? Math.round(valid.reduce((s, p) => s + p, 0) / valid.length)
      : null;

    await prisma.scheduleSlot.update({
      where: { id: slot.id },
      data: { serviceTypeId: groupService.id, frozenPrice: newPrice },
    });
    migrated++;
  }
  console.log(`✓ Переклассифицировано ${migrated} слотов из PAIR в GROUP`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
