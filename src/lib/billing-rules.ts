// Правила биллинга: какой статус → платит родитель или нет, платят ли педагогу

export const ATTENDANCE_STATUSES = {
  ATTENDED: "ATTENDED",
  SICK: "SICK",
  LATE: "LATE",
  ABSENT: "ABSENT",
} as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[keyof typeof ATTENDANCE_STATUSES];

// Родитель платит за: ATTENDED + LATE
export function shouldParentPay(status: string): boolean {
  return status === "ATTENDED" || status === "LATE";
}

// Педагог получает ЗП за: ATTENDED
export function shouldTeacherGetPaid(status: string): boolean {
  return status === "ATTENDED";
}

// Все статусы при которых родитель платит (для Prisma where)
export function getParentPayStatuses(): string[] {
  return ["ATTENDED", "LATE"];
}

// Все статусы при которых педагог получает ЗП (для Prisma where)
export function getTeacherPaidStatuses(): string[] {
  return ["ATTENDED"];
}

// Вычислить сумму биллинга для ученика
export function calculateStudentBilling(
  totalHours: number,
  hourlyRate: number
): number {
  return totalHours * hourlyRate;
}
