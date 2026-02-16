// Утилиты для импорта расписания из Google Sheets (формат сетки)
//
// Формат таблицы:
//   Строка 1: [пусто/Время] | Учитель1 | Учитель2 | Учитель3 | ...
//   Строка 2+: 09:00        | Адильулы Аскар И | метод | гр М0 | ...
//
// Ячейка: "Фамилия Имя Категория" или "метод" или "гр НазваниеГруппы"
// Категория (последнее слово): И, А, Тех, СОПР
// Группа дней (Пн/Ср/Пт или Вт/Чт) выбирается на сайте.

import { TIME_SLOTS } from "./schedule-utils";

// --- Типы ---

export interface GridCell {
  teacherName: string;
  cellValue: string; // оригинальное значение ячейки
  time: string;
  rowIndex: number; // строка в таблице
  colIndex: number; // колонка
}

export interface MatchedRow {
  cell: GridCell;
  teacherId?: string;
  teacherLabel?: string;
  studentId?: string;
  groupId?: string;
  studentOrGroupLabel?: string;
  startTime?: string;
  lessonType?: "INDIVIDUAL" | "GROUP";
  lessonCategory?: string;
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

// --- Google Sheets ---

export function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export function buildCsvUrl(sheetId: string, gid?: string): string {
  const base = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  return gid ? `${base}&gid=${gid}` : base;
}

// --- CSV парсинг ---

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

// Парсинг CSV в сетку (двумерный массив строк)
export function parseCsvToGrid(csvData: string): string[][] {
  const lines = csvData.split(/\r?\n/);
  const grid: string[][] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    grid.push(parseCsvLine(line).map((v) => v.trim()));
  }

  return grid;
}

// --- Парсинг сетки ---

// Время: "9:00" / "09:00" / "9.00" / "09.00" → "09:00"
export function parseTime(time: string): string | null {
  // Заменяем точку на двоеточие
  const normalized = time.replace(".", ":");
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = match[2];
  const formatted = `${hours.toString().padStart(2, "0")}:${minutes}`;

  if (!TIME_SLOTS.includes(formatted)) return null;
  return formatted;
}

// Извлечь ячейки из сетки → плоский список GridCell
export function extractGridCells(grid: string[][]): {
  cells: GridCell[];
  teacherNames: string[];
} {
  if (grid.length < 2) return { cells: [], teacherNames: [] };

  // Строка 1: учителя (начиная с колонки 1)
  const headerRow = grid[0];
  const teacherNames: string[] = [];
  const teacherColMap: { colIndex: number; teacherName: string }[] = [];

  for (let col = 1; col < headerRow.length; col++) {
    const name = headerRow[col]?.trim();
    if (name) {
      teacherNames.push(name);
      teacherColMap.push({ colIndex: col, teacherName: name });
    }
  }

  // Строки 2+: время в колонке 0, ученики в остальных
  const cells: GridCell[] = [];

  for (let row = 1; row < grid.length; row++) {
    const rowData = grid[row];
    const timeRaw = rowData[0]?.trim();
    if (!timeRaw) continue;

    const time = parseTime(timeRaw);
    if (!time) continue; // пропускаем строки где не время

    for (const { colIndex, teacherName } of teacherColMap) {
      const cellValue = rowData[colIndex]?.trim();
      if (!cellValue) continue; // пустая ячейка — нет занятия

      cells.push({
        teacherName,
        cellValue,
        time,
        rowIndex: row + 1, // номер строки в таблице (1-based)
        colIndex: colIndex + 1,
      });
    }
  }

  return { cells, teacherNames };
}

// --- Категории ---

const CATEGORY_SUFFIXES: Record<string, string> = {
  и: "И",
  а: "А",
  тех: "Тех",
  сопр: "СОПР",
};

// Парсинг ячейки: "Адильулы Аскар И" → { name: "Адильулы Аскар", category: "И" }
// "метод" → { name: "метод", category: "Метод" }
// "гр М0" → { name: "гр М0", category: null }
function parseCellValue(cell: string): {
  name: string;
  category: string | null;
} {
  const trimmed = cell.trim();

  // "метод" → методический час
  if (trimmed.toLowerCase() === "метод" || trimmed.toLowerCase().startsWith("метод")) {
    return { name: "метод", category: "Метод" };
  }

  // группа — не трогаем категорию
  if (/^(гр|группа)/i.test(trimmed)) {
    return { name: trimmed, category: null };
  }

  // Проверяем последнее слово — может это категория
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const lastWord = parts[parts.length - 1].toLowerCase();
    if (CATEGORY_SUFFIXES[lastWord]) {
      return {
        name: parts.slice(0, -1).join(" "),
        category: CATEGORY_SUFFIXES[lastWord],
      };
    }
  }

  // Без категории
  return { name: trimmed, category: null };
}

// --- Матчинг ---

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

  // Имя + Отчество (как в скриншоте: "Дарья Алексеевна")
  const byFirstPatronymic = teachers.filter((t) => {
    const fp = `${t.firstName} ${t.patronymic || ""}`.toLowerCase().trim();
    return fp === normalized || fp.startsWith(normalized);
  });
  if (byFirstPatronymic.length === 1) return byFirstPatronymic[0];

  // Частичное совпадение фамилии
  const byPartial = teachers.filter((t) =>
    t.lastName.toLowerCase().startsWith(normalized)
  );
  if (byPartial.length === 1) return byPartial[0];

  return null;
}

export function matchStudentOrGroup(
  name: string,
  students: StudentRecord[],
  groups: GroupRecord[]
): { type: "student" | "group" | "method"; id?: string; label?: string } | null {
  const normalized = name.toLowerCase().trim();
  if (!normalized) return null;

  // "метод"
  if (normalized === "метод" || normalized.startsWith("метод")) {
    return { type: "method", label: "Методический час" };
  }

  // "гр М0", "гр МНО", "группа М1" → группа
  const groupMatch = normalized.match(/^(?:группа\s+|гр\.?\s*)(.*)/);
  if (groupMatch) {
    const groupName = groupMatch[1].trim();
    const found = groups.find(
      (g) =>
        g.name.toLowerCase() === groupName ||
        g.name.toLowerCase().includes(groupName)
    );
    return found
      ? { type: "group", id: found.id, label: found.name }
      : null;
  }

  // Ученик: "Фамилия Имя" или "Фамилия"
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

  // Только имя (админы часто пишут только имя)
  const byFirstName = students.filter(
    (s) => s.firstName.toLowerCase() === normalized
  );
  if (byFirstName.length === 1) {
    const s = byFirstName[0];
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

export function parseCategory(cat: string): string | null {
  if (!cat.trim()) return null;
  const map: Record<string, string> = {
    а: "А", и: "И", тех: "Тех", сопр: "СОПР", метод: "Метод",
  };
  return map[cat.toLowerCase().trim()] ?? null;
}

// --- Главная функция: матчинг сетки ---

export function matchGrid(
  grid: string[][],
  teachers: TeacherRecord[],
  students: StudentRecord[],
  groups: GroupRecord[]
): ImportPreview {
  const { cells } = extractGridCells(grid);
  const matches: MatchedRow[] = [];

  for (const cell of cells) {
    const errors: string[] = [];

    // Матчим учителя
    const teacher = matchTeacher(cell.teacherName, teachers);
    const teacherId = teacher?.id;
    const teacherLabel = teacher
      ? `${teacher.lastName} ${teacher.firstName}`
      : undefined;
    if (!teacher) {
      errors.push(`Учитель не найден: "${cell.teacherName}"`);
    }

    // Время
    const startTime = parseTime(cell.time);
    if (!startTime) {
      errors.push(`Неверное время: "${cell.time}"`);
    }

    // Парсим содержимое ячейки
    const { name, category } = parseCellValue(cell.cellValue);

    // Матчим ученика/группу
    const match = matchStudentOrGroup(name, students, groups);
    let studentId: string | undefined;
    let groupId: string | undefined;
    let lessonType: "INDIVIDUAL" | "GROUP" | undefined;
    let studentOrGroupLabel: string | undefined;
    let lessonCategory = category;

    if (!match) {
      errors.push(`Не найден: "${cell.cellValue}"`);
    } else if (match.type === "method") {
      lessonType = "INDIVIDUAL";
      studentOrGroupLabel = "Методический час";
      lessonCategory = "Метод";
    } else if (match.type === "group") {
      groupId = match.id;
      lessonType = "GROUP";
      studentOrGroupLabel = `гр ${match.label}`;
    } else {
      studentId = match.id;
      lessonType = "INDIVIDUAL";
      studentOrGroupLabel = match.label;
    }

    matches.push({
      cell,
      teacherId,
      teacherLabel,
      studentId,
      groupId,
      studentOrGroupLabel,
      startTime: startTime ?? undefined,
      lessonType,
      lessonCategory: lessonCategory ?? undefined,
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
