import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEndTime } from "@/lib/schedule-utils";
import {
  extractSheetId,
  buildCsvUrl,
  parseCSV,
  matchAllRows,
  parseCategory,
  type ImportPreview,
} from "@/lib/import-utils";

// POST /api/schedule/import
// Body: { sheetUrl, weekStart, preview?: boolean }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sheetUrl, weekStart, preview } = body;

    if (!sheetUrl || !weekStart) {
      return NextResponse.json(
        { error: "sheetUrl и weekStart обязательны" },
        { status: 400 }
      );
    }

    // 1. Извлечь ID таблицы
    const sheetId = extractSheetId(sheetUrl);
    if (!sheetId) {
      return NextResponse.json(
        { error: "Неверный формат ссылки на Google Таблицу" },
        { status: 400 }
      );
    }

    // 2. Загрузить CSV
    const csvUrl = buildCsvUrl(sheetId);
    let csvData: string;

    try {
      const csvRes = await fetch(csvUrl, { signal: AbortSignal.timeout(15000) });
      if (!csvRes.ok) {
        if (csvRes.status === 404) {
          return NextResponse.json(
            { error: "Таблица не найдена. Проверьте ссылку." },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: "Не удалось загрузить таблицу. Проверьте, что она открыта для просмотра по ссылке." },
          { status: 400 }
        );
      }
      csvData = await csvRes.text();
    } catch (fetchError) {
      console.error("Ошибка при загрузке Google Sheet:", fetchError);
      return NextResponse.json(
        { error: "Не удалось загрузить таблицу. Проверьте ссылку и доступ." },
        { status: 400 }
      );
    }

    // 3. Парсинг CSV
    const rows = parseCSV(csvData);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Таблица пустая или неверный формат. Ожидаемые столбцы: Учитель, Ученик/Группа, День, Время, Категория, Кабинет" },
        { status: 400 }
      );
    }

    // 4. Загрузить данные из БД
    const [teachers, students, groups] = await Promise.all([
      prisma.teacher.findMany({ where: { isActive: true } }),
      prisma.student.findMany({ where: { isActive: true } }),
      prisma.group.findMany(),
    ]);

    // 5. Матчинг
    const result: ImportPreview = matchAllRows(rows, teachers, students, groups);

    // 6. Режим превью — вернуть результат
    if (preview) {
      return NextResponse.json(result);
    }

    // 7. Режим импорта — создать слоты
    const validMatches = result.matches.filter((m) => m.errors.length === 0);
    if (validMatches.length === 0) {
      return NextResponse.json(
        { error: "Нет валидных строк для импорта. Исправьте ошибки и попробуйте снова." },
        { status: 400 }
      );
    }

    let created = 0;
    const importErrors: string[] = [];

    for (const match of validMatches) {
      const category = match.row.category ? parseCategory(match.row.category) : null;

      // Проверка конфликта учителя
      const teacherConflict = await prisma.scheduleSlot.findFirst({
        where: {
          weekStartDate: weekStart,
          dayOfWeek: match.dayOfWeek!,
          startTime: match.startTime!,
          teacherId: match.teacherId!,
        },
      });

      if (teacherConflict) {
        importErrors.push(
          `Строка ${match.rowIndex}: учитель ${match.teacherLabel} уже занят в ${match.row.day} ${match.row.time}`
        );
        continue;
      }

      // Проверка конфликта ученика
      if (match.lessonType === "INDIVIDUAL" && match.studentId) {
        const studentConflict = await prisma.scheduleSlot.findFirst({
          where: {
            weekStartDate: weekStart,
            dayOfWeek: match.dayOfWeek!,
            startTime: match.startTime!,
            studentId: match.studentId,
          },
        });

        if (studentConflict) {
          importErrors.push(
            `Строка ${match.rowIndex}: ${match.studentOrGroupLabel} уже записан(а) на ${match.row.day} ${match.row.time}`
          );
          continue;
        }
      }

      try {
        await prisma.scheduleSlot.create({
          data: {
            teacherId: match.teacherId!,
            studentId: match.studentId || null,
            groupId: match.groupId || null,
            dayOfWeek: match.dayOfWeek!,
            startTime: match.startTime!,
            endTime: getEndTime(match.startTime!),
            weekStartDate: weekStart,
            lessonType: match.lessonType!,
            lessonCategory: category || null,
            room: match.row.room || null,
          },
        });
        created++;
      } catch (createError) {
        console.error("Ошибка создания слота:", createError);
        importErrors.push(`Строка ${match.rowIndex}: ошибка создания`);
      }
    }

    return NextResponse.json({
      count: created,
      total: validMatches.length,
      errors: importErrors,
    });
  } catch (error) {
    console.error("Ошибка импорта расписания:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
