// Утилиты для импорта расписания из Google Sheets

import { TIME_SLOTS } from "./schedule-utils";

export interface ImportRow {
  teacherName: string;
  studentOrGroup: string;
  day: string;
  time: string;
  category: string;
  room: string;
}

export interface MatchedRow {
  row: ImportRow;
  rowIndex: number;
  teacherId?: string;
  teacherLabel?: string;
  studentId?: string;
  groupId?: string;
  studentOrGroupLabel?: string;
  dayOfWeek?: number;
  startTime?: string;
  lessonType?: "INDIVIDUAL" | "GROUP";
  errors: string[];
}

export interface ImportPreview {
  totalRows: number;
  validRows: number;
  errorRows: number;
  matches: MatchedRow[];
}

interface TeacherRecord {
  id: string;
  lastName: string;
  firstName: string;
  patronymic?: string | null;
}

interface StudentRecord {
  id: string;
  lastName: string;
  firstName: string;
}

interface GroupRecord {
  id: string;
  name: string;
  teacherId: string;
}

// Извлечь ID таблицы из ссылки Google Sheets
export function extractSheetId(url: string): string | null {
  // https://docs.google.com/spreadsheets/d/SHEET_ID/edit...
  // https://docs.google.com/spreadsheets/d/SHEET_ID
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// Построить URL для скачивания CSV
export function buildCsvUrl(sheetId: string, gid?: string): string {
  const base = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  return gid ? `${base}&gid=${gid}` : base;
}

// Парсинг CSV (поддержка кавычек)
export function parseCSV(csvData: string): ImportRow[] {
  const lines = csvData.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const rows: ImportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length < 4) continue;

    const teacherName = values[0]?.trim() || "";
    const studentOrGroup = values[1]?.trim() || "";
    const day = values[2]?.trim() || "";
    const time = values[3]?.trim() || "";
    const category = values[4]?.trim() || "";
    const room = values[5]?.trim() || "";

    if (!teacherName && !studentOrGroup && !day && !time) continue;

    rows.push({ teacherName, studentOrGroup, day, time, category, room });
  }

  return rows;
}

// Парсинг одной строки CSV с поддержкой кавычек
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

// День недели: "Пн" → 1, "Вт" → 2 ...
const DAY_MAP: Record<string, number> = {
  пн: 1, понедельник: 1,
  вт: 2, вторник: 2,
  ср: 3, среда: 3,
  чт: 4, четверг: 4,
  пт: 5, пятница: 5,
  сб: 6, суббота: 6,
  вс: 7, воскресенье: 7,
};

export function parseDayOfWeek(day: string): number | null {
  const normalized = day.toLowerCase().trim();
  return DAY_MAP[normalized] ?? null;
}

// Время: "9:00" → "09:00", валидация
export function parseTime(time: string): string | null {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = match[2];
  const normalized = `${hours.toString().padStart(2, "0")}:${minutes}`;

  if (!TIME_SLOTS.includes(normalized)) return null;
  return normalized;
}

// Поиск учителя по имени
export function matchTeacher(
  name: string,
  teachers: TeacherRecord[]
): TeacherRecord | null {
  const normalized = name.toLowerCase().trim();
  if (!normalized) return null;

  // Точное совпадение по фамилии
  const byLastName = teachers.filter(
    (t) => t.lastName.toLowerCase() === normalized
  );
  if (byLastName.length === 1) return byLastName[0];

  // Фамилия + Имя
  const byFullName = teachers.filter((t) => {
    const full = `${t.lastName} ${t.firstName}`.toLowerCase();
    return full === normalized || full.startsWith(normalized);
  });
  if (byFullName.length === 1) return byFullName[0];

  // Частичное совпадение фамилии
  const byPartial = teachers.filter((t) =>
    t.lastName.toLowerCase().startsWith(normalized)
  );
  if (byPartial.length === 1) return byPartial[0];

  return null;
}

// Определить тип и найти ученика или группу
export function matchStudentOrGroup(
  name: string,
  students: StudentRecord[],
  groups: GroupRecord[]
): { type: "student" | "group" | "method"; id?: string; label?: string } | null {
  const normalized = name.toLowerCase().trim();
  if (!normalized) return null;

  // "метод" / "методический" → методический час (без ученика)
  if (normalized === "метод" || normalized.startsWith("метод")) {
    return { type: "method", label: "Методический час" };
  }

  // "Группа ..." или "гр..." → группа
  const groupMatch = normalized.match(/^(?:группа\s+|гр\.?\s*)(.*)/);
  if (groupMatch) {
    const groupName = groupMatch[1].trim();
    const found = groups.find((g) =>
      g.name.toLowerCase() === groupName ||
      g.name.toLowerCase().includes(groupName)
    );
    return found
      ? { type: "group", id: found.id, label: found.name }
      : null;
  }

  // Иначе — ученик
  // Точное совпадение "Фамилия Имя"
  const byFullName = students.filter((s) => {
    const full = `${s.lastName} ${s.firstName}`.toLowerCase();
    return full === normalized;
  });
  if (byFullName.length === 1) {
    const s = byFullName[0];
    return { type: "student", id: s.id, label: `${s.lastName} ${s.firstName}` };
  }

  // Только фамилия
  const byLastName = students.filter(
    (s) => s.lastName.toLowerCase() === normalized
  );
  if (byLastName.length === 1) {
    const s = byLastName[0];
    return { type: "student", id: s.id, label: `${s.lastName} ${s.firstName}` };
  }

  // Частичное совпадение
  const byPartial = students.filter((s) => {
    const full = `${s.lastName} ${s.firstName}`.toLowerCase();
    return full.startsWith(normalized);
  });
  if (byPartial.length === 1) {
    const s = byPartial[0];
    return { type: "student", id: s.id, label: `${s.lastName} ${s.firstName}` };
  }

  return null;
}

// Категория: нормализация
const CATEGORY_MAP: Record<string, string> = {
  а: "А", акад: "А", академические: "А",
  и: "И", интенсив: "И",
  тех: "Тех", технология: "Тех",
  сопр: "СОПР", сопровождение: "СОПР",
  метод: "Метод", методический: "Метод",
};

export function parseCategory(cat: string): string | null {
  if (!cat.trim()) return null;
  const normalized = cat.toLowerCase().trim();
  return CATEGORY_MAP[normalized] ?? null;
}

// Основная функция: матчинг всех строк
export function matchAllRows(
  rows: ImportRow[],
  teachers: TeacherRecord[],
  students: StudentRecord[],
  groups: GroupRecord[]
): ImportPreview {
  const matches: MatchedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const errors: string[] = [];

    // Учитель
    const teacher = matchTeacher(row.teacherName, teachers);
    const teacherId = teacher?.id;
    const teacherLabel = teacher
      ? `${teacher.lastName} ${teacher.firstName}`
      : undefined;
    if (!teacher) {
      errors.push(`Учитель не найден: "${row.teacherName}"`);
    }

    // День
    const dayOfWeek = parseDayOfWeek(row.day);
    if (dayOfWeek === null) {
      errors.push(`Неверный день: "${row.day}"`);
    }

    // Время
    const startTime = parseTime(row.time);
    if (startTime === null) {
      errors.push(`Неверное время: "${row.time}" (допустимо: ${TIME_SLOTS.join(", ")})`);
    }

    // Ученик/Группа
    const match = matchStudentOrGroup(row.studentOrGroup, students, groups);
    let studentId: string | undefined;
    let groupId: string | undefined;
    let lessonType: "INDIVIDUAL" | "GROUP" | undefined;
    let studentOrGroupLabel: string | undefined;

    if (!match) {
      errors.push(`Ученик/группа не найдены: "${row.studentOrGroup}"`);
    } else if (match.type === "method") {
      lessonType = "INDIVIDUAL";
      studentOrGroupLabel = "Методический час";
    } else if (match.type === "group") {
      groupId = match.id;
      lessonType = "GROUP";
      studentOrGroupLabel = `Группа ${match.label}`;
    } else {
      studentId = match.id;
      lessonType = "INDIVIDUAL";
      studentOrGroupLabel = match.label;
    }

    // Категория (не обязательная, но валидируем если указана)
    if (row.category) {
      const parsed = parseCategory(row.category);
      if (!parsed) {
        errors.push(`Неизвестная категория: "${row.category}"`);
      }
    }

    matches.push({
      row,
      rowIndex: i + 2, // строка в таблице (с учётом заголовка)
      teacherId,
      teacherLabel,
      studentId,
      groupId,
      studentOrGroupLabel,
      dayOfWeek: dayOfWeek ?? undefined,
      startTime: startTime ?? undefined,
      lessonType,
      errors,
    });
  }

  const validRows = matches.filter((m) => m.errors.length === 0).length;

  return {
    totalRows: matches.length,
    validRows,
    errorRows: matches.length - validRows,
    matches,
  };
}
