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
  pairStudentIds?: string[]; // для типа PAIR: id двух учеников
  studentOrGroupLabel?: string;
  startTime?: string;
  lessonType?: "INDIVIDUAL" | "PAIR" | "GROUP";
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
  studentNumber?: number | null;
}

interface GroupRecord {
  id: string;
  name: string | null;
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

// Нормализация пробелов (NBSP, zero-width spaces и т.д.) → обычный пробел
function normalizeWhitespace(s: string): string {
  return s.replace(/[\u00A0\u200B\u2000-\u200D\uFEFF]/g, " ");
}

// Парсинг CSV в сетку (двумерный массив строк)
// keepEmptyRows=true нужен для V2 формата (блоки разделены пустыми строками)
export function parseCsvToGrid(csvData: string, keepEmptyRows = false): string[][] {
  // Убираем BOM и нормализуем пробелы
  const cleaned = normalizeWhitespace(csvData.replace(/^\uFEFF/, ""));
  const lines = cleaned.split(/\r\n|\r|\n/);
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
  // Нормализуем множественные пробелы: «Алтынгуль  Кенжебек» → «Алтынгуль Кенжебек».
  const normalized = name.toLowerCase().trim().replace(/\s+/g, " ");
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

  // Имя + Фамилия (Дархан иногда пишет в этом порядке): «Алтынгуль Кенжебек»
  const byReverseName = teachers.filter((t) => {
    const rev = `${t.firstName} ${t.lastName}`.toLowerCase().trim();
    return rev === normalized || rev.startsWith(normalized);
  });
  if (byReverseName.length === 1) return byReverseName[0];

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

  // Имя + начало фамилии: "Евгения В" → firstName="Евгения", lastName starts with "В"
  const words = normalized.split(/\s+/);
  if (words.length === 2 && words[1].length <= 2) {
    const [firstName, lastInitial] = words;
    const byNameInitial = teachers.filter((t) =>
      t.firstName.toLowerCase() === firstName &&
      t.lastName.toLowerCase().startsWith(lastInitial)
    );
    if (byNameInitial.length === 1) return byNameInitial[0];
  }

  // Имя + Отчество + инициал фамилии: "Дарья Александровна Х." → firstName="Дарья",
  // patronymic="Александровна", lastName starts with "Х"
  if (words.length === 3) {
    const [firstName, patronymic, lastInitialRaw] = words;
    const lastInitial = lastInitialRaw.replace(/\./g, "");
    if (lastInitial.length <= 2) {
      const byThree = teachers.filter((t) =>
        t.firstName.toLowerCase() === firstName &&
        (t.patronymic ?? "").toLowerCase() === patronymic &&
        t.lastName.toLowerCase().startsWith(lastInitial)
      );
      if (byThree.length === 1) return byThree[0];
    }
  }

  // Частичное совпадение фамилии
  const byPartial = teachers.filter((t) =>
    t.lastName.toLowerCase().startsWith(normalized)
  );
  if (byPartial.length === 1) return byPartial[0];

  // Фоллбэк: Levenshtein на «Имя Отчество». Помогает на типах опечаток типа Дайана/Даяна.
  // Считаем по конкатенации Имя+Отчество без пробелов, чтобы дистанция была чувствительной
  // к одной-двум перестановкам букв.
  const compact = (s: string): string => s.replace(/\s+/g, "").toLowerCase();
  const normCompact = compact(normalized);
  if (normCompact.length >= 8) {
    const scored = teachers
      .map((t) => {
        const fp = compact(`${t.firstName}${t.patronymic ?? ""}`);
        return { teacher: t, dist: levenshtein(normCompact, fp) };
      })
      .sort((a, b) => a.dist - b.dist);

    const best = scored[0];
    const second = scored[1];
    // Принимаем только если: дистанция мала (<=2) И отрыв от второго кандидата явный (>=2).
    if (best && best.dist <= 2 && (!second || second.dist - best.dist >= 2)) {
      return best.teacher;
    }
  }

  return null;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

// --- Подсказки «похоже это он?» для нераспознанных ячеек ---

export interface StudentSuggestion {
  id: string;
  label: string;
  distance: number;
}

// Очищает ячейку до «ядра» имени: убирает хвостовые дни/категории/точки,
// из пары "X+Y" берёт первую часть. Для похожести это достаточно.
function coreNameForSuggest(raw: string): string {
  let s = raw.replace(/\./g, " ").replace(/\s+/g, " ").trim();
  if (s.includes("+")) s = s.split("+")[0].trim();
  // хвостовые дни и категории (можно несколько подряд)
  for (let i = 0; i < 4; i++) {
    const next = s.replace(
      /\s+(пн|вт|ср|чт|пт|и|а|тех|сопр|дз|рл|каз|мно|нов|лог|афк|акад|инт)$/i,
      "",
    ).trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

// Возвращает до `limit` наиболее похожих учеников на текст ячейки, отсортированных
// по близости. Использует Левенштейна по Имя/Фамилия/Имя+Фамилия/Фамилия+Имя с
// бонусом за префиксное совпадение. Порог зависит от длины — короткие имена строже.
export function suggestStudentMatches(
  rawName: string,
  students: StudentRecord[],
  limit = 3,
): StudentSuggestion[] {
  const compact = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const target = compact(coreNameForSuggest(rawName));
  if (!target) return [];

  const scored = students.map((s) => {
    const fn = s.firstName.toLowerCase();
    const ln = s.lastName.toLowerCase();
    const cands = [fn, ln, compact(`${fn}${ln}`), compact(`${ln}${fn}`)];
    let best = Infinity;
    for (const c of cands) {
      if (!c) continue;
      let d = levenshtein(target, c);
      // Префикс: «Асан» ↔ «Асанали» — считаем как разницу длин, а не полную дистанцию.
      if (c.startsWith(target) || target.startsWith(c)) {
        d = Math.min(d, Math.abs(c.length - target.length));
      }
      best = Math.min(best, d);
    }
    return { s, distance: best };
  });

  const threshold = Math.max(2, Math.ceil(target.length * 0.45));
  return scored
    .filter((x) => x.distance <= threshold)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((x) => ({
      id: x.s.id,
      label: `${x.s.lastName} ${x.s.firstName}${
        x.s.studentNumber != null ? ` #${x.s.studentNumber.toString().padStart(3, "0")}` : ""
      }`,
      distance: x.distance,
    }));
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

  // Дархан 15.06+: в Google Sheets везде проставляет ID («Мансура 009»).
  // ID — единая точка истины (Дархан явно ставит номер, значит выбор осознанный).
  // Приоритет матча: ЕСТЬ ЧИСЛО → берём ученика с этим studentNumber, имя не проверяем.
  // Так парсер идеально ходит по шаблонному расписанию где Дархан просто везде
  // указал номера. Если имя не сходится с найденным — это на совести автора файла.
  const numMatch = name.match(/\b(\d{1,3})\b/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    const byNumber = students.find((s) => s.studentNumber === num);
    if (byNumber) {
      return {
        type: "student",
        id: byNumber.id,
        label: `${byNumber.lastName} ${byNumber.firstName}`,
      };
    }
  }

  // "гр М0", "гр МНО", "группа М1" → группа
  const groupMatch = normalized.match(/^(?:группа\s+|гр\.?\s*)(.*)/);
  if (groupMatch) {
    // Нормализация: убираем все пробелы и подчёркивания внутри имени группы,
    // чтобы «ОНР2» / «ОНР 2» / «ОНР_2» матчились одинаково. Дархан в видео 12.06
    // явно просил: «иногда с пробелом, без пробела — для него это принципиально».
    const groupName = groupMatch[1].replace(/[\s_]+/g, "").trim();
    const found = groups.find((g) => {
      const n = (g.name ?? "").toLowerCase().replace(/[\s_]+/g, "");
      return n && (n === groupName || n.includes(groupName));
    });
    return found
      ? { type: "group", id: found.id, label: found.name ?? "" }
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

export type ImportFormatV2 = "v1-simple" | "v2-multiblock" | "v3-saturday";

export interface ImportPreviewV2 extends ImportPreview {
  matches: MatchedRowV2[];
  detectedFormat: ImportFormatV2;
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
  type: "student" | "group" | "method" | "multi_student" | "support_group" | "skip" | "internship";
  names: string[];
  groupName: string | null;
  category: string | null;
  dayOverride: number[] | null;
  raw: string;
  mentor?: string | null; // наставник для type="internship"
}

// --- V2: Автодетекция формата ---

export function detectFormat(
  grid: string[][],
): "v1-simple" | "v2-multiblock" | "v3-saturday" {
  if (grid.length < 3) return "v1-simple";

  // Ищем маркеры дней ("пн ср пт" / "вт чт") в первых 5 строках
  // Используем includes для робастности (NBSP, лишние пробелы и т.д.)
  for (let i = 0; i < Math.min(5, grid.length); i++) {
    const row = grid[i];
    const hasDayMarkers = row.some((cell) => {
      const c = cell.toLowerCase().replace(/\s+/g, " ").trim();
      return (c.includes("пн") && c.includes("пт")) || c === "вт чт";
    });
    if (hasDayMarkers) return "v2-multiblock";
  }

  // v3 (суббота): один блок, время в строках, нет пн/ср/пт колонок. Триггер —
  // первая колонка содержит «время» (10.00/11.00/12.00) подряд в 2+ строках.
  let timeRows = 0;
  for (let i = 0; i < Math.min(10, grid.length); i++) {
    const cell = (grid[i]?.[0] ?? "").toString().trim();
    if (/^(09|10|11|12|13|14)[.:]00/.test(cell) || /^(09|10|11|12|13|14):00:00$/.test(cell)) {
      timeRows++;
      if (timeRows >= 2) return "v3-saturday";
    }
  }

  return "v1-simple";
}

// --- V2: Разбивка на блоки ---

function splitIntoBlocks(grid: string[][]): string[][][] {
  const blocks: string[][][] = [];
  let currentBlock: string[][] = [];
  let separatorRun = 0;

  // Строка-разделитель = пустая, либо "почти пустая" (≤2 заполненных ячеек, не считая первой
  // колонки времени). Между блоками у Дархана бывают строки с 1-4 ячейками заметок/легенды —
  // их нельзя считать частью блока, иначе соседние блоки склеиваются.
  const isSeparator = (row: string[]): boolean => {
    let nonEmpty = 0;
    for (let i = 1; i < row.length; i++) {
      if (row[i]?.trim()) nonEmpty++;
      if (nonEmpty > 2) return false;
    }
    return true;
  };

  for (const row of grid) {
    if (isSeparator(row)) {
      separatorRun++;
      if (currentBlock.length >= 3 && separatorRun >= 1) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
    } else {
      separatorRun = 0;
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
  // Нормализуем пробелы: «Оксана Ивановна И +А» → «Оксана Ивановна И+А».
  let remaining = header.trim().replace(/\s+\+\s*/g, "+");

  // Извлечь кабинет: "№1каб", "№11 каб", "№1 + 3 + 4 каб", "№ 5каб"
  let room: string | null = null;
  const roomMatch = remaining.match(/№\s*([\d\s+]+)\s*каб/i);
  if (roomMatch) {
    room = roomMatch[1].trim();
    remaining = remaining.replace(roomMatch[0], "").trim();
  }

  // Извлечь специализацию: "И", "А", "Тех", "И+А", "АФК", "ЛОГ", "ИНФ", "РЛ", "ДЗ"
  // Могут быть несколько подряд: «Дильназ Ж А» → сначала «А», потом «Ж» уже
  // относится к фамилии. Отрезаем максимум 2 раза.
  const SPEC_PATTERN = /\s+(И\+А|И|А|ТЕХ|АФК|ЛОГ|ИНФ|РЛ|ДЗ)\s*$/i;
  let specialization: string | null = null;
  for (let i = 0; i < 2; i++) {
    const m = remaining.match(SPEC_PATTERN);
    if (!m) break;
    if (!specialization) specialization = m[1];
    remaining = remaining.slice(0, m.index).trim();
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

    // Пропускаем легенду: "гРМ0", "ГРМ1", "СОПР", "АМ\АТ", "дм\да", "ДЖ\РН"
    if (/^[гГ][рР]/i.test(headerCell) && headerCell.length <= 10) continue;
    // Любой заголовок с обратной/прямой косой чертой — легенда (не имя учителя)
    if (headerCell.includes("\\") || headerCell.includes("/")) continue;
    // Короткие аббревиатуры только из букв (строчных или прописных) и пробелов — легенда
    if (/^[а-яёА-ЯЁa-zA-Z\s]+$/.test(headerCell) && headerCell.length <= 6) continue;
    // Пропускаем служебные заголовки
    const headerLower = headerCell.toLowerCase();
    if (headerLower.includes("практикант") || headerLower.includes("стажер") || headerLower.includes("стажёр")) continue;
    // Служебные заголовки правых колонок (заметки/легенда)
    const SERVICE_HEADERS = ["методисты", "время", "сопр", "мно", "комментарий", "примечание", "заметка"];
    if (SERVICE_HEADERS.some((s) => headerLower === s || headerLower.startsWith(s + " "))) continue;
    // Маркеры дней попавшие в заголовок: "пн ср пт", "вт чт"
    if (/^(пн|вт|ср|чт|пт|сб|вс)([\s,]+(пн|вт|ср|чт|пт|сб|вс))+$/i.test(headerCell)) continue;
    // Чистим заголовок от кабинета (№1каб, №11 каб, № 5каб, №1 + 3 + 4 каб) для дальнейших проверок
    const cleaned = headerCell
      .replace(/№\s*[\d\s+]+\s*каб[^\s]*/gi, "")
      .replace(/№\s*[\d\s+]+/g, "")
      .trim();
    // После очистки от кабинета: если ещё остались цифры или двоеточие — это заметка/правка
    // ("рамзана в 11:00 ИМ"), не имя педагога.
    if (/[\d:]/.test(cleaned)) continue;
    // Текст полностью в верхнем регистре без строчных букв — служебная аббревиатура ("МЕТОДИСТЫ")
    const lettersOnly = cleaned.replace(/[^а-яёa-zА-ЯЁA-Z]/g, "");
    if (lettersOnly.length >= 3 && lettersOnly === lettersOnly.toUpperCase()) continue;
    // Одно слово без специализации (И/А/ТЕХ/И+А) и без признаков ФИО (отчества) — не педагог.
    // Имена педагогов либо содержат >=2 слова (Имя Отчество), либо имеют суффикс специализации,
    // либо казахские отчества типа "Азаматқызы".
    {
      const hasSpec = /\s+(И\+А|И|А|ТЕХ)\s*$/i.test(cleaned);
      const hasMultipleWords = cleaned.split(/\s+/).filter(Boolean).length >= 2;
      const hasKzPatronymic = /(қызы|улы|ұлы|кызы)$/i.test(cleaned);
      if (!hasSpec && !hasMultipleWords && !hasKzPatronymic) continue;
    }

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

// Стажировки. Расшифровка от Дархана (07.07): ячейка "стрж"/"стдм"/"стев" означает,
// что педагог (в чьей колонке стоит ячейка) не ведёт ребёнка, а стажируется у наставника.
// "ст" + инициалы наставника: рж=Ризат Жанатовна, дм=Динара Мейрамкызы, ев=Евгения Викторовна.
// Слот создаётся без ученика (как «метод») → в оплату педагога не попадает.
// Список точечный, чтобы не спутать со студентами (напр. «Стас»). Новые — дописать сюда.
const INTERNSHIP_MENTORS: Record<string, string> = {
  стрж: "Ризат Жанатовна",
  стдм: "Динара Мейрамкызы",
  стев: "Евгения Викторовна",
};

// Распознаёт стажировку по ячейке. Берёт первый токен (на случай хвостов вроде
// «стрж пн ср»), нормализует (нижний регистр, без точек). null — не стажировка.
function detectInternship(raw: string): { mentor: string } | null {
  const firstToken = raw.trim().split(/\s+/)[0]?.toLowerCase().replace(/\./g, "") ?? "";
  if (firstToken && INTERNSHIP_MENTORS[firstToken]) {
    return { mentor: INTERNSHIP_MENTORS[firstToken] };
  }
  return null;
}

export function parseCellValueV2(cell: string): ParsedCellV2 {
  // Нормализация: схлопываем множественные пробелы, убираем NBSP, убираем мусорные начала ("/")
  const trimmed = cell
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\/+\s*/, "")
    .trim();

  // Пустые / отменённые
  if (!trimmed || /^-+$/.test(trimmed) || trimmed === "/") {
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

  // "стрж"/"стдм"/"стев" → стажировка педагога у наставника (без ученика).
  const internship = detectInternship(trimmed);
  if (internship) {
    return {
      type: "internship",
      names: [],
      groupName: null,
      category: "Стажировка",
      dayOverride: null,
      raw: trimmed,
      mentor: internship.mentor,
    };
  }

  // Сопровождение группы: "сопр грМ0", "сопргрМНО ОНР", "сорп гр..." (опечатка)
  const supportGroupMatch = trimmed.match(/^(?:сопр|сорп)\s*гр\.?\s*(.+)/i);
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

  // Индивидуальный ученик: "Асанали И", "МаркВ И пн-пт", "Улпан А ср пт",
  // "Алихан мно пн ср", "Самира ТЕХ.", "Алинурнов. ЛОГ.", "Алан нов И".
  // Стратегия: вырезаем все «хвостовые» токены (дни, категории, флаг «нов», точки)
  // в любом порядке, пока остаётся что-то распознаваемое.
  let remaining = trimmed;
  const dayOverrideSet = new Set<number>();
  let category: string | null = null;

  // Многократно сбрасываем хвосты: дни, категорию, флаг «нов», точки.
  for (let safety = 0; safety < 8; safety++) {
    const before = remaining;

    // 1. Хвостовые дни: "пн-пт", "ср пт", "пн,пт", "ср"
    const dayPattern = /[\s,]+((?:пн|вт|ср|чт|пт)(?:[\s,\-]+(?:пн|вт|ср|чт|пт))*)\.?\s*$/i;
    const dayMatch = remaining.match(dayPattern);
    if (dayMatch) {
      const days = parseDayList(dayMatch[1]) ?? [];
      for (const d of days) dayOverrideSet.add(d);
      remaining = remaining.slice(0, dayMatch.index!).trim();
    }

    // 2. Хвостовая категория (И/А/ТЕХ/СОПР/ДЗ/РЛ/каз/МНО/мно/нов/лог/афк), возможно с точкой
    const words = remaining.split(/\s+/);
    if (words.length >= 2) {
      const lastWordRaw = words[words.length - 1];
      const lastWord = lastWordRaw.toLowerCase().replace(/\.+$/, "");
      const isFlag = lastWord === "нов";
      if (CATEGORY_SUFFIXES_V2[lastWord]) {
        if (!category) category = CATEGORY_SUFFIXES_V2[lastWord];
        words.pop();
        remaining = words.join(" ");
      } else if (isFlag) {
        // «нов» — пометка «новый ученик», для матчинга не нужна
        words.pop();
        remaining = words.join(" ");
      } else if (lastWord === "лог" || lastWord === "логопед") {
        if (!category) category = "ЛОГ";
        words.pop();
        remaining = words.join(" ");
      } else if (lastWord === "афк") {
        if (!category) category = "АФК";
        words.pop();
        remaining = words.join(" ");
      } else if (lastWord === "акад" || lastWord === "академ") {
        if (!category) category = "А";
        words.pop();
        remaining = words.join(" ");
      } else if (lastWord === "инт" || lastWord === "интенсив") {
        if (!category) category = "И";
        words.pop();
        remaining = words.join(" ");
      }
    }

    // 3. Хвостовые точки и пробелы
    remaining = remaining.replace(/[.\s]+$/, "").trim();

    if (remaining === before) break;
  }

  const dayOverride = dayOverrideSet.size > 0 ? Array.from(dayOverrideSet).sort() : null;

  // Имя заканчивается на "-" → отменённый слот
  if (remaining.endsWith("-")) {
    return { type: "skip", names: [], groupName: null, category: null, dayOverride: null, raw: trimmed };
  }

  if (!remaining) {
    return { type: "skip", names: [], groupName: null, category: null, dayOverride: null, raw: trimmed };
  }

  return {
    type: "student",
    names: [remaining],
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

  // Пары без названия (groupType=PAIR) исключаем — их матчим не по имени
  const named = groups.filter((g) => !!g.name && g.name.trim().length > 0);
  const norm2 = (g: GroupRecord) => (g.name ?? "").toLowerCase().replace(/\s+/g, "");

  // Точное совпадение (нормализованное)
  const exact = named.find((g) => norm2(g) === norm);
  if (exact) return exact;

  // Попробовать с префиксом "гр" (в БД может быть "грМ0", а мы ищем "М0")
  const withPrefix = named.find((g) => norm2(g) === "гр" + norm);
  if (withPrefix) return withPrefix;

  // Обратное: в БД "М0", а мы ищем "грМ0" → убираем "гр" из нашего запроса
  const withoutPrefix = norm.startsWith("гр")
    ? named.find((g) => norm2(g) === norm.slice(2))
    : null;
  if (withoutPrefix) return withoutPrefix;

  // Содержит / содержится
  const contains = named.filter((g) => {
    const gNorm = norm2(g);
    return gNorm.includes(norm) || norm.includes(gNorm);
  });
  if (contains.length === 1) return contains[0];

  // Попробовать с/без "гр" в contains
  const containsWithGr = named.filter((g) => {
    const gNorm = norm2(g);
    return gNorm.includes("гр" + norm) || ("гр" + norm).includes(gNorm);
  });
  if (containsWithGr.length === 1) return containsWithGr[0];

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

  // Матчим учителя: сначала полное имя, потом сокращения («АртурВ», «НигматД», «Дильназ Ж»).
  // Дархан в шаблоне часто пишет коротко — надо всех сматчить.
  const teacher = matchTeacher(cell.teacherName, teachers)
    ?? matchTeacherByAbbr(cell.teacherName, teachers);
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
  } else if (parsed.type === "internship") {
    // Стажировка: слот-метка без ученика (как метод) → в оплату не идёт.
    lessonType = "INDIVIDUAL";
    studentOrGroupLabel = parsed.mentor
      ? `Стажировка у ${parsed.mentor}`
      : "Стажировка";
    lessonCategory = "Стажировка";
  } else if (parsed.type === "group" || parsed.type === "support_group") {
    const group = matchGroupFuzzy(parsed.groupName!, groups);
    if (group) {
      groupId = group.id;
      lessonType = "GROUP";
      studentOrGroupLabel = `гр ${group.name ?? ""}`;
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
  groups: GroupRecord[],
  detectedFormat?: ImportFormatV2,
): ImportPreviewV2 {
  const format = detectedFormat ?? detectFormat(grid);

  if (format === "v3-saturday") {
    return matchGridV3Saturday(grid, teachers, students, groups);
  }

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

    if (parsed.type === "multi_student" && parsed.names.length === 2) {
      // Пара: один MatchedRow с lessonType=PAIR + id обоих учеников
      const matched = matchSingleCellV2(
        cell,
        { ...parsed, type: "student", names: [parsed.names[0]] },
        teachers,
        students,
        groups,
      );
      const second = matchSingleCellV2(
        cell,
        { ...parsed, type: "student", names: [parsed.names[1]] },
        teachers,
        students,
        groups,
      );

      const ids: string[] = [];
      if (matched.studentId) ids.push(matched.studentId);
      if (second.studentId) ids.push(second.studentId);

      const combinedErrors = [...matched.errors, ...second.errors.filter((e) => !matched.errors.includes(e))];
      const label = `пара: ${matched.studentOrGroupLabel ?? parsed.names[0]} + ${second.studentOrGroupLabel ?? parsed.names[1]}`;

      matches.push({
        ...matched,
        studentId: undefined,
        groupId: undefined,
        pairStudentIds: ids,
        studentOrGroupLabel: label,
        lessonType: "PAIR",
        errors: combinedErrors,
      });
    } else if (parsed.type === "multi_student") {
      // 3+ учеников — пока обрабатываем как индивидуальные записи (legacy поведение)
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

// =====================================================================
// V3: Субботнее расписание (один блок, время в строках, dayOfWeek=6)
// =====================================================================
//
// Формат у Дархана:
//   Строка 1: [Время] | АртурВ | РЖ | НД | ОИ/АЕ | Дильназ Ж | ... — педагоги
//             в сокращениях. Иногда "ПП\ДМ" = два педагога на колонке.
//   Строка 2: иногда служебная (09:00:00)
//   Строки 3+: 10.00 | Ердар | Расул | ... — время + ученики
//   Стоп при пустой строке или строке заметок (ДЕТИ / ПЕДАГОГИ / 1).
//
// Все слоты получают dayOfWeek=6.

// Раскрывает сокращение педагога ("АртурВ", "РЖ", "Дильназ Ж", "ОИ/АЕ", "ПП\ДМ").
// Возвращает список имён (один или два — при двойном заголовке).
function splitTeacherHeader(header: string): string[] {
  // Разделители: \, /, "," (запятая для "ДМ, АЕ,")
  return header
    .split(/[\\\/,]/)
    .map((s) => s.trim().replace(/[,\s]+$/g, ""))
    .filter(Boolean);
}

// Матч педагога по сокращению. Поддерживает:
//   "АртурВ" → Имя=Артур, инициал отчества/фамилии=В
//   "РЖ", "НД" → две заглавных = инициалы Имя+Отчества
//   "Дильназ Ж" → имя + первая буква отчества/фамилии
//   "ФатимаА", "ДарьяВ", "АленаВ" → ИмяБ (буква фамилии)
//   "Аида Т", "Айдана Т" → имя + первая буква отчества/фамилии
//   "Дарья Е" → может конфликтовать (две Дарьи); вернём null
function matchTeacherByAbbr(
  abbr: string,
  teachers: TeacherRecord[],
): TeacherRecord | null {
  // Отрезаем суффиксы категорий которые Дархан пишет после имени педагога:
  // «РоманА ИНФ» / «Дильназ Ж А» / «Даяна О И» / «Дарья Владимеровна И».
  // Могут быть несколько подряд («Дильназ Ж А» — сначала А (категория),
  // потом Ж уже относится к фамилии — не отрезаем).
  let cleaned = abbr.trim();
  const SUFFIX_RX = /\s+(И\+А|И|А|ТЕХ|АФК|ЛОГ|ИНФ|РЛ|ДЗ)\s*$/i;
  for (let i = 0; i < 3; i++) {
    const m = cleaned.match(SUFFIX_RX);
    if (!m) break;
    cleaned = cleaned.slice(0, m.index).trim();
  }
  if (!cleaned) return null;

  // 2-3 буквенная аббревиатура из заглавных: "РЖ" → Имя+Отчество, "ДАХ" → Имя+Отч+Фам
  if (/^[А-ЯЁA-Z]{2,3}\.?$/.test(cleaned)) {
    const letters = cleaned.replace(/\./g, "").split("");
    const candidates = teachers.filter((t) => {
      const first = t.firstName.charAt(0).toUpperCase();
      const patron = (t.patronymic ?? "").charAt(0).toUpperCase();
      const last = t.lastName.charAt(0).toUpperCase();
      if (letters.length === 2) {
        // Имя+Отчество (приоритет) ИЛИ Имя+Фамилия
        return first === letters[0] && (patron === letters[1] || last === letters[1]);
      }
      return first === letters[0] && patron === letters[1] && last === letters[2];
    });
    if (candidates.length === 1) return candidates[0];
    // При неоднозначности отдаём приоритет совпадению Имя+Отчество
    if (candidates.length > 1) {
      const byPatron = candidates.filter(
        (t) => letters.length >= 2 && (t.patronymic ?? "").charAt(0).toUpperCase() === letters[1],
      );
      if (byPatron.length === 1) return byPatron[0];
      if (byPatron.length > 0) return byPatron[0];
      return candidates[0];
    }
  }

  // "ИмяБ" (имя + 1-2 буквы фамилии/отчества слитно): "АртурВ", "ФатимаА", "ДарьяВ"
  const fusedMatch = cleaned.match(/^([А-ЯЁA-Z][а-яёa-z]+)([А-ЯЁA-Z]{1,2})$/);
  if (fusedMatch) {
    const [, firstNameMaybe, suffix] = fusedMatch;
    const candidates = teachers.filter((t) => {
      if (t.firstName.toLowerCase() !== firstNameMaybe.toLowerCase()) return false;
      const patron = (t.patronymic ?? "").toUpperCase();
      const last = t.lastName.toUpperCase();
      return patron.startsWith(suffix) || last.startsWith(suffix);
    });
    if (candidates.length === 1) return candidates[0];
    // Приоритет: фамилия начинается с suffix (АртурВ → Алфутов Артур Васильевич — патронимик)
    // ДарьяВ может быть Вячеславовна (отчество) или Владимеровна (отчество).
    // Берём по отчеству первой.
    if (candidates.length > 1) {
      const byPatron = candidates.filter((t) => (t.patronymic ?? "").toUpperCase().startsWith(suffix));
      if (byPatron.length >= 1) return byPatron[0];
      return candidates[0];
    }
  }

  // "Имя Б" (имя + первая буква отчества/фамилии через пробел): "Дильназ Ж", "Аида Т"
  const spacedMatch = cleaned.match(/^([А-ЯЁA-Z][а-яёa-z]+)\s+([А-ЯЁA-Z])\.?$/);
  if (spacedMatch) {
    const [, firstNameMaybe, suffix] = spacedMatch;
    const candidates = teachers.filter((t) => {
      if (t.firstName.toLowerCase() !== firstNameMaybe.toLowerCase()) return false;
      const patron = (t.patronymic ?? "").charAt(0).toUpperCase();
      const last = t.lastName.charAt(0).toUpperCase();
      return patron === suffix || last === suffix;
    });
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      const byPatron = candidates.filter((t) => (t.patronymic ?? "").charAt(0).toUpperCase() === suffix);
      if (byPatron.length >= 1) return byPatron[0];
      return candidates[0];
    }
  }

  // Полное имя — пробуем стандартный matchTeacher
  return matchTeacher(cleaned, teachers);
}

// Строка-стоппер: ниже неё парсинг прекращается (служебные заметки).
function isV3StopRow(row: string[]): boolean {
  const joined = row.join(" ").toLowerCase().trim();
  if (!joined) return true;
  // "ДЕТИ" / "ПЕДАГОГИ" / "1 Максим 2ч с 10"
  if (/(дети|педагог|расход|подсчёт)/i.test(joined)) return true;
  // Строка с одиночными порядковыми номерами в первой колонке
  const first = (row[0] ?? "").trim();
  if (/^\d{1,2}$/.test(first)) return true;
  return false;
}

function matchGridV3Saturday(
  grid: string[][],
  teachers: TeacherRecord[],
  students: StudentRecord[],
  groups: GroupRecord[],
): ImportPreviewV2 {
  const matches: MatchedRowV2[] = [];
  const teachersDetected: string[] = [];

  if (grid.length < 2) {
    return {
      totalRows: 0,
      validRows: 0,
      errorRows: 0,
      matches: [],
      detectedFormat: "v3-saturday",
      blocksDetected: 1,
      teachersDetected: [],
    };
  }

  // Заголовки педагогов в строке 1, колонки 2+ (B+).
  const headerRow = grid[0];
  const headerColumns: { col: number; primary: string; secondary?: string }[] = [];
  for (let c = 1; c < headerRow.length; c++) {
    const raw = (headerRow[c] ?? "").trim();
    if (!raw) continue;
    const parts = splitTeacherHeader(raw);
    if (parts.length === 0) continue;
    headerColumns.push({ col: c, primary: parts[0], secondary: parts[1] });
    teachersDetected.push(parts[0] + (parts[1] ? ` / ${parts[1]}` : ""));
  }

  // Строки данных: пропускаем строку заголовка (0). Дальше — для каждой строки
  // проверяем что в первой колонке есть время.
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    if (isV3StopRow(row)) break;

    const timeRaw = (row[0] ?? "").trim();
    const parsedTime = parseTime(timeRaw);
    if (!parsedTime) continue; // строка без времени — пропускаем (служебная)

    for (const hc of headerColumns) {
      const cellValue = (row[hc.col] ?? "").trim();
      if (!cellValue) continue;

      const teacher = matchTeacherByAbbr(hc.primary, teachers);
      const cell: GridCellV2 = {
        teacherName: hc.primary,
        cellValue,
        time: parsedTime,
        rowIndex: r,
        colIndex: hc.col,
        dayGroup: "mwf", // не используется для v3 — все слоты будут на dayOfWeek=6
        room: null,
      };

      const parsed = parseCellValueV2(cellValue);
      if (parsed.type === "skip") continue;

      const row2 = matchSingleCellV2(cell, parsed, teachers, students, groups);

      // Подменяем учителя на найденного через abbr (matchSingleCellV2 матчит по
      // hc.primary, что часто не работает для сокращений — переопределим).
      if (teacher && !row2.teacherId) {
        row2.teacherId = teacher.id;
        row2.teacherLabel = `${teacher.lastName} ${teacher.firstName}`;
        row2.errors = row2.errors.filter((e) => !e.startsWith("Учитель не найден"));
      } else if (!teacher && row2.teacherId) {
        // фоллбэк уже сработал, ничего не делаем
      } else if (!teacher && hc.primary) {
        // явная ошибка
        if (!row2.errors.some((e) => e.startsWith("Учитель не найден"))) {
          row2.errors.push(`Учитель не найден: "${hc.primary}"`);
        }
      }

      // Если есть второй педагог в заголовке (ПП\ДМ) — добавим в label
      if (hc.secondary) {
        row2.studentOrGroupLabel = `${row2.studentOrGroupLabel ?? ""} [также: ${hc.secondary}]`.trim();
      }

      matches.push(row2);
    }
  }

  const validRows = matches.filter((m) => m.errors.length === 0).length;

  return {
    totalRows: matches.length,
    validRows,
    errorRows: matches.length - validRows,
    matches,
    detectedFormat: "v3-saturday",
    blocksDetected: 1,
    teachersDetected,
  };
}
