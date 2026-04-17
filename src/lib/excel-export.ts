import * as XLSX from "xlsx";

export type ExcelColumn = {
  header: string; // заголовок колонки
  key: string; // ключ в объекте данных
  width?: number; // ширина колонки (в символах)
};

// Генерация Excel-файла в виде Buffer
export function generateExcel(params: {
  columns: ExcelColumn[];
  rows: Record<string, unknown>[];
  sheetName?: string;
  title?: string; // заголовок над таблицей
  totals?: Record<string, unknown>; // строка итогов
}): Buffer {
  const { columns, rows, sheetName = "Отчёт", title, totals } = params;

  const wsData: unknown[][] = [];

  // Заголовок документа
  if (title) {
    wsData.push([title]);
    wsData.push([]); // пустая строка
  }

  // Заголовки колонок
  wsData.push(columns.map((c) => c.header));

  // Данные
  for (const row of rows) {
    wsData.push(columns.map((c) => row[c.key] ?? ""));
  }

  // Строка итогов
  if (totals) {
    wsData.push([]); // пустая строка перед итогами
    wsData.push(columns.map((c) => totals[c.key] ?? ""));
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Ширина колонок
  ws["!cols"] = columns.map((c) => ({ wch: c.width || 15 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf);
}

// Хелпер для создания Response с Excel-файлом
export function excelResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
