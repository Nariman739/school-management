// Утилиты для индикатора консультации в карточке ученика и списках.
// Фидбек Дархана 12.06: «чтобы постоянно напоминало, мозолило глаза при расчёте
// зарплаты или приёме оплат». Логика:
//   - lastConsultationDate + intervalMonths = nextDueDate
//   - today >= nextDueDate → красная сиренка (просрочено)
//   - today + 7д >= nextDueDate → жёлтый (скоро)
//   - lastConsultationDate отсутствует → серый «нет данных»
//   - Иначе — без значка

export type ConsultationStatus = "overdue" | "due_soon" | "ok" | "missing";

export interface ConsultationInfo {
  status: ConsultationStatus;
  daysUntilDue: number | null; // отрицательное = просрочено на N дней
  nextDueDate: string | null;   // "YYYY-MM-DD"
  label: string;                // что показывать в тултипе
}

function parseDate(d: string): Date | null {
  const t = new Date(d + "T00:00:00Z");
  return Number.isNaN(t.getTime()) ? null : t;
}

function todayYMD(): string {
  return new Date().toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export function getConsultationInfo(args: {
  lastConsultationDate?: string | null;
  consultationIntervalMonths?: number | null;
  todayOverride?: string;
}): ConsultationInfo {
  const { lastConsultationDate, consultationIntervalMonths } = args;
  const todayStr = args.todayOverride ?? todayYMD();
  const today = parseDate(todayStr)!;

  if (!lastConsultationDate || !consultationIntervalMonths || consultationIntervalMonths <= 0) {
    return {
      status: "missing",
      daysUntilDue: null,
      nextDueDate: null,
      label: lastConsultationDate
        ? "Интервал консультации не задан"
        : "Консультация ещё не проводилась",
    };
  }

  const last = parseDate(lastConsultationDate);
  if (!last) {
    return { status: "missing", daysUntilDue: null, nextDueDate: null, label: "Некорректная дата" };
  }

  const next = addMonths(last, consultationIntervalMonths);
  const nextStr = next.toISOString().slice(0, 10);
  const days = Math.floor((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (days <= 0) {
    return {
      status: "overdue",
      daysUntilDue: days,
      nextDueDate: nextStr,
      label: `Просрочено на ${Math.abs(days)} дн. (надо было ${nextStr})`,
    };
  }
  if (days <= 7) {
    return {
      status: "due_soon",
      daysUntilDue: days,
      nextDueDate: nextStr,
      label: `Скоро срок: через ${days} дн. (${nextStr})`,
    };
  }
  return {
    status: "ok",
    daysUntilDue: days,
    nextDueDate: nextStr,
    label: `Следующая ${nextStr}`,
  };
}

// Эмодзи + классы для иконки индикатора
export function getConsultationBadge(status: ConsultationStatus): {
  emoji: string;
  className: string;
} {
  switch (status) {
    case "overdue":
      return { emoji: "🔔", className: "text-red-600" };
    case "due_soon":
      return { emoji: "🔔", className: "text-amber-500" };
    case "missing":
      return { emoji: "·", className: "text-gray-300" };
    default:
      return { emoji: "", className: "" };
  }
}
