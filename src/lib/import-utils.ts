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
// keepEmptyRows=true нужен для V2 формата (блоки разделены пустыми строками)
export function parseCsvToGrid(csvData: string, keepEmptyRows = false): string[][] {
  const lines = csvData.split(/\r?\n/);
  const grid: string[][] = [];

  for (const line of lines) {
    if (!keepEmptyRows && !line.trim()) continue;
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

  // Только имя (для коротких записей)
  const byFirstNameOnly = teachers.filter(
    (t) => t.firstName.toLowerCase() === normalized
  );
  if (byFirstNameOnly.length === 1) return byFirstNameOnly[0];

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

// =====================================================================
// V2: Многоблочный формат Google Sheets (реальный формат клиента)
// =====================================================================
//
// Формат: 4 блока учителей, каждый блок:
//   Строка 1: [пусто] | Учитель1 Имя Отчество Спец №Каб | [пусто] | Учитель2 ... | ...
//   Строка 2: [пусто] | пн ср пт | вт чт | пн ср пт | вт чт | ...
//   Строки 3+: 9.00   | ученик/группа | ученик/группа | ...
// Блоки разделены пустыми строками.

// --- V2 типы ---

export interface GridCellV2 extends GridCell {
  dayGroup: "mwf" | "tt";
  room: string | null;
}

export interface MatchedRowV2 extends MatchedRow {
  dayGroup: "mwf" | "tt";
  room: string | null;
}

export interface ImportPreviewV2 extends ImportPreview {
  matches: MatchedRowV2[];
  detectedFormat: "v1-simple" | "v2-multiblock";
  blocksDetected: number;
  teachersDetected: string[];
}

interface BlockTeacher {
  rawHeader: string;
  displayName: string;
  specialization: string | null;
  room: string | null;
  mwfColIndex: number;
  ttColIndex: number;
}

interface ParsedCellV2 {
  type: "student" | "group" | "method" | "multi_student" | "support_group" | "skip";
  names: string[];
  groupName: string | null;
  category: string | null;
  dayOverride: number[] | null;
  raw: string;
}

// --- V2: Автодетекция формата ---

export function detectFormat(grid: string[][]): "v1-simple" | "v2-multiblock" {
  if (grid.length < 3) return "v1-simple";

  // Ищем маркеры дней ("пн ср пт" / "вт чт") в первых 5 строках
  for (let i = 0; i < Math.min(5, grid.length); i++) {
    const row = grid[i];
    const hasDayMarkers = row.some((cell) => {
      const c = cell.toLowerCase().trim();
      return c === "пн ср пт" || c === "вт чт";
    });
    if (hasDayMarkers) return "v2-multiblock";
  }

  return "v1-simple";
}

// --- V2: Разбивка на блоки ---

function splitIntoBlocks(grid: string[][]): string[][][] {
  const blocks: string[][][] = [];
  let currentBlock: string[][] = [];
  let emptyCount = 0;

  for (const row of grid) {
    const isEmptyRow = row.every((cell) => !cell.trim());

    if (isEmptyRow) {
      emptyCount++;
      if (currentBlock.length >= 3 && emptyCount >= 1) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
    } else {
      emptyCount = 0;
      currentBlock.push(row);
    }
  }

  if (currentBlock.length >= 3) {
    blocks.push(currentBlock);
  }

  return blocks;
}

function isScheduleBlock(block: string[][]): boolean {
  if (block.length < 3) return false;
  // Строка 2 должна содержать маркеры дней
  const row1 = block[1];
  return row1.some((cell) => {
    const c = cell.toLowerCase().trim();
    return c.includes("пн") || c.includes("вт чт");
  });
}

// --- V2: Парсинг заголовков учителей ---

function parseTeacherHeaderV2(header: string): {
  displayName: string;
  specialization: string | null;
  room: string | null;
} {
  let remaining = header.trim();

  // Извлечь кабинет: "№1каб", "№11 каб", "№1 + 3 + 4 каб", "№ 5каб"
  let room: string | null = null;
  const roomMatch = remaining.match(/№\s*([\d\s+]+)\s*каб/i);
  if (roomMatch) {
    room = roomMatch[1].trim();
    remaining = remaining.replace(roomMatch[0], "").trim();
  }

  // Извлечь специализацию: "И", "А", "Тех", "И+А"
  const SPEC_PATTERN = /\s+(И\+А|И|А|ТЕХ)\s*$/i;
  let specialization: string | null = null;
  const specMatch = remaining.match(SPEC_PATTERN);
  if (specMatch) {
    specialization = specMatch[1];
    remaining = remaining.slice(0, specMatch.index).trim();
  }

  return { displayName: remaining, specialization, room };
}

function parseBlockColumns(block: string[][]): BlockTeacher[] {
  if (block.length < 2) return [];

  const headerRow = block[0];
  const dayRow = block[1];
  const teachers: BlockTeacher[] = [];

  for (let col = 1; col < headerRow.length; col++) {
    const headerCell = headerRow[col]?.trim();
    if (!headerCell) continue;

    // Пропускаем легенду: "гРМ0", "ГРМ1", "СОПР", "АМ\АТ", "дм\да"
    if (/^[гГ][рР]/i.test(headerCell) && headerCell.length <= 10) continue;
    if (/^[А-ЯA-Z\\\/\s]+$/.test(headerCell) && headerCell.length <= 8) continue;

    const { displayName, specialization, room } = parseTeacherHeaderV2(headerCell);

    // Определяем колонки пн/ср/пт и вт/чт из строки дней
    const dayCell1 = (dayRow[col] || "").toLowerCase().trim();
    const dayCell2 = (dayRow[col + 1] || "").toLowerCase().trim();

    let mwfCol: number;
    let ttCol: number;

    if (dayCell1.includes("пн")) {
      mwfCol = col;
      ttCol = col + 1;
    } else if (dayCell1.includes("вт")) {
      ttCol = col;
      mwfCol = col + 1;
    } else {
      mwfCol = col;
      ttCol = col + 1;
    }

    teachers.push({
      rawHeader: headerCell,
      displayName,
      specialization,
      room,
      mwfColIndex: mwfCol,
      ttColIndex: ttCol,
    });
  }

  return teachers;
}

// --- V2: Парсинг ячеек ---

function isSkipValue(val: string): boolean {
  const trimmed = val.trim().toLowerCase();
  if (!trimmed) return true;
  if (/^-+$/.test(trimmed)) return true;
  if (/^метод\s*-+$/.test(trimmed)) return true;
  if (trimmed === "им") return true;
  return false;
}

const DAY_NAME_MAP: Record<string, number> = {
  пн: 1, вт: 2, ср: 3, чт: 4, пт: 5,
};

function parseDayList(dayStr: string): number[] | null {
  const normalized = dayStr.toLowerCase().trim();
  if (!normalized) return null;

  // Диапазон: "пн-пт"
  const rangeMatch = normalized.match(/^(пн|вт|ср|чт|пт)-(пн|вт|ср|чт|пт)$/);
  if (rangeMatch) {
    const start = DAY_NAME_MAP[rangeMatch[1]];
    const end = DAY_NAME_MAP[rangeMatch[2]];
    if (start && end) {
      const days: number[] = [];
      for (let d = start; d <= end; d++) days.push(d);
      return days;
    }
  }

  // Список: "ср пт", "пн ср"
  const dayTokens = normalized.split(/[\s,]+/);
  const days = dayTokens
    .map((t) => DAY_NAME_MAP[t])
    .filter((d): d is number => d !== undefined);

  return days.length > 0 ? days : null;
}

const CATEGORY_SUFFIXES_V2: Record<string, string> = {
  и: "И", а: "А", тех: "Тех", сопр: "СОПР",
  дз: "ДЗ", рл: "РЛ", каз: "каз", мно: "МНО",
};

function parseCellValueV2(cell: string): ParsedCellV2 {
  const trimmed = cell.trim();

  // Пустые / отменённые
  if (!trimmed || /^-+$/.test(trimmed)) {
    return { type: "skip", names: [], groupName: null, category: null, dayOverride: null, raw: trimmed };
  }

  const lower = trimmed.toLowerCase();

  // "ИМ" — стажёр → пропускаем
  if (lower === "им") {
    return { type: "skip", names: [], groupName: null, category: null, dayOverride: null, raw: trimmed };
  }

  // "метод-", "метод --" → отменённый метод → пропуск
  if (/^метод\s*-+$/i.test(lower)) {
    return { type: "skip", names: [], groupName: null, category: null, dayOverride: null, raw: trimmed };
  }

  // "метод", "метод1" → методический час
  if (/^метод\d*$/i.test(lower)) {
    return { type: "method", names: [], groupName: null, category: "Метод", dayOverride: null, raw: trimmed };
  }

  // Сопровождение группы: "сопр грМ0", "сопргрМНО ОНР"
  const supportGroupMatch = trimmed.match(/^сопр\s*гр\.?\s*(.+)/i);
  if (supportGroupMatch) {
    return {
      type: "support_group",
      names: [],
      groupName: supportGroupMatch[1].trim(),
      category: "СОПР",
      dayOverride: null,
      raw: trimmed,
    };
  }

  // Группа: "грМ0", "гр М0", "гр.М0", "гршк1", "гр шк 1", "грреч1", "группа X"
  const groupMatch = trimmed.match(/^(?:группа\s+|гр\.?\s*)(.*)/i);
  if (groupMatch) {
    return {
      type: "group",
      names: [],
      groupName: groupMatch[1].trim(),
      category: null,
      dayOverride: null,
      raw: trimmed,
    };
  }

  // "МНО" отдельно, "МНО каз", "МНО ф.", "МНО ОНР" → групповое занятие
  if (/^МНО/i.test(trimmed)) {
    return {
      type: "group",
      names: [],
      groupName: trimmed,
      category: null,
      dayOverride: null,
      raw: trimmed,
    };
  }

  // Два ученика: "Малика+Асанали", "Жансая+Ерхан", но НЕ "X+Y-" (отменённый)
  if (trimmed.includes("+")) {
    if (trimmed.endsWith("-")) {
      return { type: "skip", names: [], groupName: null, category: null, dayOverride: null, raw: trimmed };
    }

    const parts = trimmed.split("+").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return {
        type: "multi_student",
        names: parts,
        groupName: null,
        category: null,
        dayOverride: null,
        raw: trimmed,
      };
    }
  }

  // Индивидуальный ученик: "Асанали И", "МаркВ И пн-пт", "Улпан А ср пт"
  let remaining = trimmed;
  let dayOverride: number[] | null = null;

  // Извлечь дни из конца: "пн-пт", "ср пт"
  const dayPattern = /\s+((?:пн|вт|ср|чт|пт)(?:[\s-]+(?:пн|вт|ср|чт|пт))*)\s*$/i;
  const dayMatch = remaining.match(dayPattern);
  if (dayMatch) {
    dayOverride = parseDayList(dayMatch[1]);
    remaining = remaining.slice(0, dayMatch.index!).trim();
  }

  // Извлечь категорию (последнее слово)
  const words = remaining.split(/\s+/);
  let category: string | null = null;

  if (words.length >= 2) {
    const lastWord = words[words.length - 1].toLowerCase();
    if (CATEGORY_SUFFIXES_V2[lastWord]) {
      category = CATEGORY_SUFFIXES_V2[lastWord];
      words.pop();
    }
  }

  const name = words.join(" ");

  // Имя заканчивается на "-" → отменённый слот
  if (name.endsWith("-")) {
    return { type: "skip", names: [], groupName: null, category: null, dayOverride: null, raw: trimmed };
  }

  return {
    type: "student",
    names: [name],
    groupName: null,
    category,
    dayOverride,
    raw: trimmed,
  };
}

// --- V2: Матчинг учеников по сокращённым именам ---

function matchStudentByAbbreviation(
  abbr: string,
  students: StudentRecord[]
): StudentRecord | null {
  const normalized = abbr.trim();
  if (!normalized) return null;

  // Точное совпадение по имени
  const byFirstName = students.filter(
    (s) => s.firstName.toLowerCase() === normalized.toLowerCase()
  );
  if (byFirstName.length === 1) return byFirstName[0];

  // Разбиение: "МаркВ" → first="Марк", last starts with "В"
  for (let i = 2; i < normalized.length; i++) {
    const firstPart = normalized.slice(0, i).toLowerCase();
    const lastPart = normalized.slice(i).toLowerCase();

    if (!lastPart) continue;

    const matches = students.filter((s) => {
      const fn = s.firstName.toLowerCase();
      const ln = s.lastName.toLowerCase();
      return fn.startsWith(firstPart) && ln.startsWith(lastPart);
    });

    if (matches.length === 1) return matches[0];
  }

  // Целая строка как фамилия
  const byLastName = students.filter(
    (s) => s.lastName.toLowerCase() === normalized.toLowerCase()
  );
  if (byLastName.length === 1) return byLastName[0];

  // Частичная фамилия
  const byPartialLast = students.filter(
    (s) => s.lastName.toLowerCase().startsWith(normalized.toLowerCase())
  );
  if (byPartialLast.length === 1) return byPartialLast[0];

  // Частичное имя
  const byPartialFirst = students.filter(
    (s) => s.firstName.toLowerCase().startsWith(normalized.toLowerCase())
  );
  if (byPartialFirst.length === 1) return byPartialFirst[0];

  return null;
}

// --- V2: Fuzzy-матчинг групп ---

function matchGroupFuzzy(
  name: string,
  groups: GroupRecord[]
): GroupRecord | null {
  if (!name) return null;

  // Нормализация: убираем пробелы, lowercase
  const norm = name.toLowerCase().replace(/\s+/g, "");

  // Точное совпадение (нормализованное)
  const exact = groups.find(
    (g) => g.name.toLowerCase().replace(/\s+/g, "") === norm
  );
  if (exact) return exact;

  // Содержит / содержится
  const contains = groups.filter((g) => {
    const gNorm = g.name.toLowerCase().replace(/\s+/g, "");
    return gNorm.includes(norm) || norm.includes(gNorm);
  });
  if (contains.length === 1) return contains[0];

  return null;
}

// --- V2: Извлечение ячеек из многоблочной сетки ---

function extractGridCellsV2(grid: string[][]): {
  cells: GridCellV2[];
  teacherNames: string[];
  blocksCount: number;
} {
  const blocks = splitIntoBlocks(grid);
  const scheduleBlocks = blocks.filter(isScheduleBlock);
  const allCells: GridCellV2[] = [];
  const allTeacherNames: string[] = [];

  for (const block of scheduleBlocks) {
    const teachers = parseBlockColumns(block);
    allTeacherNames.push(...teachers.map((t) => t.displayName));

    // Строки данных начинаются с индекса 2 (после заголовка и строки дней)
    for (let rowIdx = 2; rowIdx < block.length; rowIdx++) {
      const row = block[rowIdx];
      const timeRaw = row[0]?.trim();
      if (!timeRaw) continue;

      const time = parseTime(timeRaw);
      if (!time) continue;

      for (const teacher of teachers) {
        // Колонка Пн/Ср/Пт
        const mwfValue = row[teacher.mwfColIndex]?.trim();
        if (mwfValue && !isSkipValue(mwfValue)) {
          allCells.push({
            teacherName: teacher.displayName,
            cellValue: mwfValue,
            time,
            rowIndex: rowIdx + 1,
            colIndex: teacher.mwfColIndex + 1,
            dayGroup: "mwf",
            room: teacher.room,
          });
        }

        // Колонка Вт/Чт
        const ttValue = row[teacher.ttColIndex]?.trim();
        if (ttValue && !isSkipValue(ttValue)) {
          allCells.push({
            teacherName: teacher.displayName,
            cellValue: ttValue,
            time,
            rowIndex: rowIdx + 1,
            colIndex: teacher.ttColIndex + 1,
            dayGroup: "tt",
            room: teacher.room,
          });
        }
      }
    }
  }

  return {
    cells: allCells,
    teacherNames: [...new Set(allTeacherNames)],
    blocksCount: scheduleBlocks.length,
  };
}

// --- V2: Матчинг одной ячейки ---

function matchSingleCellV2(
  cell: GridCellV2,
  parsed: ParsedCellV2,
  teachers: TeacherRecord[],
  students: StudentRecord[],
  groups: GroupRecord[]
): MatchedRowV2 {
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

  let studentId: string | undefined;
  let groupId: string | undefined;
  let lessonType: "INDIVIDUAL" | "GROUP" | undefined;
  let studentOrGroupLabel: string | undefined;
  let lessonCategory = parsed.category;

  if (parsed.type === "method") {
    lessonType = "INDIVIDUAL";
    studentOrGroupLabel = "Методический час";
    lessonCategory = "Метод";
  } else if (parsed.type === "group" || parsed.type === "support_group") {
    const group = matchGroupFuzzy(parsed.groupName!, groups);
    if (group) {
      groupId = group.id;
      lessonType = "GROUP";
      studentOrGroupLabel = `гр ${group.name}`;
    } else {
      errors.push(`Группа не найдена: "${parsed.groupName}"`);
    }
    if (parsed.type === "support_group") {
      lessonCategory = "СОПР";
    }
  } else if (parsed.type === "student") {
    const studentName = parsed.names[0];

    // Стандартный матчинг
    const match = matchStudentOrGroup(studentName, students, groups);
    if (match && match.type === "student") {
      studentId = match.id;
      lessonType = "INDIVIDUAL";
      studentOrGroupLabel = match.label;
    } else if (match && match.type === "group") {
      groupId = match.id;
      lessonType = "GROUP";
      studentOrGroupLabel = `гр ${match.label}`;
    } else if (match && match.type === "method") {
      lessonType = "INDIVIDUAL";
      studentOrGroupLabel = "Методический час";
      lessonCategory = "Метод";
    } else {
      // Фоллбэк: матчинг по сокращённому имени
      const abbrMatch = matchStudentByAbbreviation(studentName, students);
      if (abbrMatch) {
        studentId = abbrMatch.id;
        lessonType = "INDIVIDUAL";
        studentOrGroupLabel = `${abbrMatch.lastName} ${abbrMatch.firstName}`;
      } else {
        errors.push(`Не найден: "${cell.cellValue}"`);
      }
    }
  }

  return {
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
    dayGroup: cell.dayGroup,
    room: cell.room,
  };
}

// --- V2: Главная функция матчинга ---

export function matchGridV2(
  grid: string[][],
  teachers: TeacherRecord[],
  students: StudentRecord[],
  groups: GroupRecord[]
): ImportPreviewV2 {
  const format = detectFormat(grid);

  if (format === "v1-simple") {
    // Делегируем в старый матчинг для обратной совместимости
    const result = matchGrid(grid, teachers, students, groups);
    return {
      ...result,
      matches: result.matches.map((m) => ({
        ...m,
        dayGroup: "mwf" as const,
        room: null,
      })),
      detectedFormat: "v1-simple",
      blocksDetected: 1,
      teachersDetected: [],
    };
  }

  // V2: многоблочный парсинг
  const { cells, teacherNames, blocksCount } = extractGridCellsV2(grid);
  const matches: MatchedRowV2[] = [];

  for (const cell of cells) {
    const parsed = parseCellValueV2(cell.cellValue);

    if (parsed.type === "skip") continue;

    // Для "два ученика" — создаём отдельную запись для каждого
    if (parsed.type === "multi_student") {
      for (const studentName of parsed.names) {
        const row = matchSingleCellV2(
          cell,
          { ...parsed, type: "student", names: [studentName] },
          teachers,
          students,
          groups
        );
        matches.push(row);
      }
    } else {
      const row = matchSingleCellV2(cell, parsed, teachers, students, groups);
      matches.push(row);
    }
  }

  const validRows = matches.filter((m) => m.errors.length === 0).length;

  return {
    totalRows: matches.length,
    validRows,
    errorRows: matches.length - validRows,
    matches,
    detectedFormat: "v2-multiblock",
    blocksDetected: blocksCount,
    teachersDetected: teacherNames,
  };
}
