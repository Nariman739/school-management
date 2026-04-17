// Правила биллинга: какой статус → платит родитель или нет, платят ли педагогу

export const ATTENDANCE_STATUSES = {
  ATTENDED: "ATTENDED",
  ABSENT_NO_REASON: "ABSENT_NO_REASON",
  ABSENT_VALID_REASON: "ABSENT_VALID_REASON",
  SICK: "SICK",
  TRANSFERRED: "TRANSFERRED",
  MAKEUP: "MAKEUP",
  // Legacy (для обратной совместимости старых данных)
  LATE: "LATE",
  ABSENT: "ABSENT",
} as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[keyof typeof ATTENDANCE_STATUSES];

export const STATUS_LABELS: Record<string, string> = {
  ATTENDED: "Присутствовал",
  ABSENT_NO_REASON: "Без причины",
  ABSENT_VALID_REASON: "Уважительная",
  SICK: "Больничный",
  TRANSFERRED: "Перенос",
  MAKEUP: "Отработка",
  // Legacy
  LATE: "Опоздание",
  ABSENT: "Отсутствовал",
};

export const STATUS_COLORS: Record<string, string> = {
  ATTENDED: "bg-green-100 text-green-800",
  ABSENT_NO_REASON: "bg-red-100 text-red-800",
  ABSENT_VALID_REASON: "bg-yellow-100 text-yellow-800",
  SICK: "bg-blue-100 text-blue-800",
  TRANSFERRED: "bg-purple-100 text-purple-800",
  MAKEUP: "bg-teal-100 text-teal-800",
  LATE: "bg-orange-100 text-orange-800",
  ABSENT: "bg-gray-100 text-gray-800",
};

// Родитель платит за:
// ATTENDED — был на уроке
// ABSENT_NO_REASON — не был без причины (штраф)
// MAKEUP — отработка (зачёт)
// LATE — legacy (опоздание)
export function shouldParentPay(status: string): boolean {
  return ["ATTENDED", "ABSENT_NO_REASON", "MAKEUP", "LATE"].includes(status);
}

// Педагог получает ЗП за:
// ATTENDED — провёл урок
// MAKEUP — провёл отработку
export function shouldTeacherGetPaid(status: string): boolean {
  return ["ATTENDED", "MAKEUP"].includes(status);
}

// Для Prisma where — статусы при которых родитель платит
export function getParentPayStatuses(): string[] {
  return ["ATTENDED", "ABSENT_NO_REASON", "MAKEUP", "LATE"];
}

// Для Prisma where — статусы при которых педагог получает ЗП
export function getTeacherPaidStatuses(): string[] {
  return ["ATTENDED", "MAKEUP"];
}

// Активные статусы для выбора (без legacy)
export function getActiveStatuses(): { value: string; label: string }[] {
  return [
    { value: "ATTENDED", label: "Присутствовал" },
    { value: "ABSENT_NO_REASON", label: "Без причины" },
    { value: "ABSENT_VALID_REASON", label: "Уважительная причина" },
    { value: "SICK", label: "Больничный" },
    { value: "TRANSFERRED", label: "Перенос" },
    { value: "MAKEUP", label: "Отработка" },
  ];
}
