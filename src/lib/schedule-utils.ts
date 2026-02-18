// Утилиты для работы с расписанием

export const DAYS_OF_WEEK = [
  { value: 1, label: "Пн", full: "Понедельник" },
  { value: 2, label: "Вт", full: "Вторник" },
  { value: 3, label: "Ср", full: "Среда" },
  { value: 4, label: "Чт", full: "Четверг" },
  { value: 5, label: "Пт", full: "Пятница" },
  { value: 6, label: "Сб", full: "Суббота" },
  { value: 7, label: "Вс", full: "Воскресенье" },
];

export const TIME_SLOTS = [
  "09:00", "10:00", "11:00", "12:00", "13:00",
  "14:00", "15:00", "16:00", "17:00", "18:00",
];

export const LESSON_CATEGORIES = [
  { value: "А", label: "Академические" },
  { value: "И", label: "Интенсив" },
  { value: "Тех", label: "Технология" },
  { value: "СОПР", label: "Сопровождение" },
  { value: "Метод", label: "Методический час" },
  { value: "ДЗ", label: "Домашнее задание" },
  { value: "РЛ", label: "Русская литература" },
  { value: "каз", label: "Казахский язык" },
  { value: "МНО", label: "Предшкольная подготовка" },
  { value: "АФК", label: "Адаптивная физкультура" },
];

export const DAY_GROUPS = [
  { id: "mwf", label: "Пн / Ср / Пт", days: [1, 3, 5] },
  { id: "tt", label: "Вт / Чт", days: [2, 4] },
];

export function getMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

export function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().split("T")[0];
}

export function formatWeekRange(mondayStr: string): string {
  const monday = new Date(mondayStr);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  const formatDate = (d: Date) =>
    `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}`;

  return `${formatDate(monday)} — ${formatDate(sunday)}`;
}

export function getEndTime(startTime: string): string {
  const [hours, minutes] = startTime.split(":").map(Number);
  const endHours = hours + 1;
  return `${endHours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}
