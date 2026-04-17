import { prisma } from "@/lib/prisma";

type AuditAction = "CREATE" | "UPDATE" | "DELETE";

// Записать изменение в журнал аудита
export async function logAudit(params: {
  entityType: string;
  entityId: string;
  action: AuditAction;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  changes?: Record<string, { old: any; new: any }> | null;
  userId?: string | null;
  userName?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        changes: params.changes ? JSON.parse(JSON.stringify(params.changes)) : undefined,
        userId: params.userId ?? null,
        userName: params.userName ?? null,
      },
    });
  } catch (error) {
    // Аудит не должен ломать основную операцию
    console.error("Ошибка записи в audit log:", error);
  }
}

// Вычислить diff между старым и новым объектом
export function diffChanges(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  fields: string[]
): Record<string, { old: unknown; new: unknown }> | null {
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  for (const field of fields) {
    const oldVal = oldObj[field];
    const newVal = newObj[field];
    if (oldVal !== newVal) {
      changes[field] = { old: oldVal, new: newVal };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}
