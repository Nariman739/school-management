import { prisma } from "./prisma";

export const SERVICE_DEFAULT_INDIVIDUAL_CODE = "IND_N";
export const SERVICE_PAIR_CODE = "PAIR";
export const SERVICE_GROUP_CODE = "GROUP";

export type ServiceKind = "INDIVIDUAL" | "PAIR" | "GROUP";

const isLegacyMode = () => process.env.USE_LEGACY_PRICING === "true";

export async function resolveServicePrice(
  studentId: string,
  serviceTypeId: string | null | undefined,
): Promise<number | null> {
  if (isLegacyMode()) {
    const s = await prisma.student.findUnique({ where: { id: studentId }, select: { hourlyRate: true } });
    return s?.hourlyRate ?? null;
  }

  if (serviceTypeId) {
    const price = await prisma.studentServicePrice.findUnique({
      where: { studentId_serviceTypeId: { studentId, serviceTypeId } },
      select: { price: true, serviceType: { select: { kind: true } } },
    });
    if (price?.price && price.price > 0) return price.price;

    const svc = await prisma.serviceType.findUnique({ where: { id: serviceTypeId }, select: { kind: true } });
    if (svc?.kind === "INDIVIDUAL") {
      const s = await prisma.student.findUnique({ where: { id: studentId }, select: { hourlyRate: true } });
      if (s?.hourlyRate && s.hourlyRate > 0) return s.hourlyRate;
    }
    return null;
  }

  const s = await prisma.student.findUnique({ where: { id: studentId }, select: { hourlyRate: true } });
  return s?.hourlyRate && s.hourlyRate > 0 ? s.hourlyRate : null;
}

type SlotContext = {
  lessonType?: string | null;
  groupType?: string | null;
};

export async function getDefaultServiceTypeForSlot(ctx: SlotContext) {
  let kind: ServiceKind = "INDIVIDUAL";
  if (ctx.lessonType === "GROUP") {
    kind = ctx.groupType === "PAIR" ? "PAIR" : "GROUP";
  } else if (ctx.groupType === "PAIR") {
    kind = "PAIR";
  } else if (ctx.groupType === "GROUP") {
    kind = "GROUP";
  }

  return prisma.serviceType.findFirst({
    where: { kind, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function freezePriceForSlot(opts: {
  studentId?: string | null;
  groupId?: string | null;
  serviceTypeId?: string | null;
}): Promise<number | null> {
  if (!opts.serviceTypeId) return null;

  if (opts.studentId) {
    return resolveServicePrice(opts.studentId, opts.serviceTypeId);
  }

  if (opts.groupId) {
    const group = await prisma.group.findUnique({
      where: { id: opts.groupId },
      include: { members: { select: { studentId: true } } },
    });
    if (!group) return null;
    const prices = await Promise.all(
      group.members.map((m) => resolveServicePrice(m.studentId, opts.serviceTypeId!)),
    );
    const valid = prices.filter((p): p is number => typeof p === "number" && p > 0);
    if (!valid.length) return null;
    return Math.round(valid.reduce((s, p) => s + p, 0) / valid.length);
  }

  return null;
}

export async function resolveSlotPriceForStudent(
  slot: { id?: string; frozenPrice?: number | null; serviceTypeId?: string | null; lessonType?: string | null },
  studentId: string,
  fallbackHourlyRate?: number | null,
): Promise<number> {
  if (slot.frozenPrice && slot.frozenPrice > 0) return slot.frozenPrice;

  const matrixPrice = await resolveServicePrice(studentId, slot.serviceTypeId);
  if (matrixPrice && matrixPrice > 0) return matrixPrice;

  if (fallbackHourlyRate && fallbackHourlyRate > 0) return fallbackHourlyRate;

  const s = await prisma.student.findUnique({ where: { id: studentId }, select: { hourlyRate: true } });
  return s?.hourlyRate ?? 0;
}
