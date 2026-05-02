// Логика расчёта заработной платы педагогов

type TeacherRates = {
  morningBonusRate: number;
  eveningBonusRate: number;
  individualRate: number;
  groupRate: number;
  groupRate3: number;
  groupRate5: number;
  behavioralBonus: number;
  assistantRate: number;
};

// Бонус за время суток (утро 9:00-10:00, вечер 17:00-19:00)
export function getTimeBonus(
  startTime: string,
  teacher: Pick<TeacherRates, "morningBonusRate" | "eveningBonusRate">
): number {
  const hour = parseInt(startTime.split(":")[0], 10);
  if (hour === 9 && teacher.morningBonusRate > 0) return teacher.morningBonusRate;
  if (hour >= 17 && hour < 19 && teacher.eveningBonusRate > 0) return teacher.eveningBonusRate;
  return 0;
}

// Ставка за группу по количеству присутствующих
export function getGroupRate(
  presentCount: number,
  teacher: Pick<TeacherRates, "groupRate" | "groupRate3" | "groupRate5">
): number {
  if (presentCount >= 5 && teacher.groupRate5 > 0) return teacher.groupRate5;
  if (presentCount >= 3 && teacher.groupRate3 > 0) return teacher.groupRate3;
  return teacher.groupRate;
}

// Тип записи ЗП по одному уроку
export type SalaryDetail = {
  day: number;
  time: string;
  type: string;
  description: string;
  hours: number;
  rate: number;
  timeBonus: number;
  behavioralExtra: number;
  sum: number;
  isSubstitution: boolean;
  isAssistant: boolean;
};

// Сводка ЗП по педагогу
export type SalaryEntry = {
  teacherId: string;
  teacherName: string;
  individualHours: number;
  groupHours: number;
  individualTotal: number;
  groupTotal: number;
  behavioralBonus: number;
  timeBonusTotal: number;
  assistantTotal: number;
  methodistBonus: number;
  substitutionTotal: number;
  total: number;
  details: SalaryDetail[];
};

export function createEmptySalaryEntry(teacher: {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string | null;
}): SalaryEntry {
  return {
    teacherId: teacher.id,
    teacherName: `${teacher.lastName} ${teacher.firstName} ${teacher.patronymic || ""}`.trim(),
    individualHours: 0,
    groupHours: 0,
    individualTotal: 0,
    groupTotal: 0,
    behavioralBonus: 0,
    timeBonusTotal: 0,
    assistantTotal: 0,
    methodistBonus: 0,
    substitutionTotal: 0,
    total: 0,
    details: [],
  };
}

export function recalcTotal(entry: SalaryEntry): void {
  entry.total =
    entry.individualTotal +
    entry.groupTotal +
    entry.behavioralBonus +
    entry.timeBonusTotal +
    entry.assistantTotal +
    entry.methodistBonus;
}

// Рассчитать бонус за поведенческих детей
export function calculateBehavioralBonus(
  presentStudents: { isBehavioral: boolean }[],
  teacherBehavioralBonus: number
): number {
  if (teacherBehavioralBonus <= 0) return 0;
  return presentStudents.filter((s) => s.isBehavioral).length * teacherBehavioralBonus;
}

// Рассчитать методический бонус за неделю
// Платим только за дни, явно отмеченные как "состоялся".
// Без отметок — 0 (никаких автоматических начислений за неделю).
export function calculateMethodistBonus(
  teacher: { methodistWeeklyRate: number; methodistDailyRate: number },
  checks: { completed: number; total: number } | undefined
): number {
  if (teacher.methodistWeeklyRate <= 0) return 0;

  const completed = checks?.completed ?? 0;
  if (completed === 0) return 0;

  const dailyRate =
    teacher.methodistDailyRate > 0
      ? teacher.methodistDailyRate
      : Math.round(teacher.methodistWeeklyRate / 5);

  return Math.min(completed * dailyRate, teacher.methodistWeeklyRate);
}

// Вычислить даты для каждого дня недели
export function getWeekDates(weekStart: string): Map<number, string> {
  const weekDates = new Map<number, string>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    weekDates.set(i + 1, d.toISOString().split("T")[0]);
  }
  return weekDates;
}
