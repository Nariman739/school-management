import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEndTime, DAY_GROUPS } from "@/lib/schedule-utils";
import {
  extractSheetId,
  buildCsvUrl,
  parseCsvToGrid,
  matchGrid,
  matchGridV2,
  detectFormat,
} from "@/lib/import-utils";
import type { ImportPreviewV2, MatchedRowV2 } from "@/lib/import-utils";

// POST /api/schedule/import
// Body: { sheetUrl, weekStart, dayGroup?: "mwf"|"tt", preview?: boolean }
// dayGroup обязателен для v1 формата, опционален для v2 (определяется из таблицы)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sheetUrl, weekStart, dayGroup, preview } = body;

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

    // 3. Определить формат и парсить CSV
    // Для определения формата нужно сначала распарсить с пустыми строками
    const gridWithEmpty = parseCsvToGrid(csvData, true);
    const format = detectFormat(gridWithEmpty);

    // Для v1 формата dayGroup обязателен
    if (format === "v1-simple" && !dayGroup) {
      return NextResponse.json(
        { error: "Для простого формата выберите группу дней (Пн/Ср/Пт или Вт/Чт)" },
        { status: 400 }
      );
    }

    // Для v1 парсим без пустых строк (как раньше), для v2 — с пустыми
    const grid = format === "v2-multiblock" ? gridWithEmpty : parseCsvToGrid(csvData);

    if (grid.length < 2) {
      return NextResponse.json(
        { error: "Таблица пустая. Нужна строка с учителями и хотя бы одна строка с временем." },
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
    const result = matchGridV2(grid, teachers, students, groups) as ImportPreviewV2;

    if (result.totalRows === 0) {
      return NextResponse.json(
        { error: "Не найдено занятий. Проверьте формат таблицы." },
        { status: 400 }
      );
    }

    // 6. Режим превью
    if (preview) {
      return NextResponse.json(result);
    }

    // 7. Режим импорта — создать слоты
    const validMatches = result.matches.filter((m) => m.errors.length === 0);
    if (validMatches.length === 0) {
      return NextResponse.json(
        { error: "Нет валидных строк для импорта." },
        { status: 400 }
      );
    }

    let created = 0;
    const importErrors: string[] = [];

    for (const match of validMatches) {
      const matchV2 = match as MatchedRowV2;

      // Определяем дни для этого слота
      let days: number[];
      if (result.detectedFormat === "v2-multiblock") {
        // Дни определяются из колонки ячейки (пн/ср/пт или вт/чт)
        const dg = DAY_GROUPS.find((g) => g.id === matchV2.dayGroup);
        days = dg?.days || [];
      } else {
        // V1: используем выбранный пользователем dayGroup
        const dg = DAY_GROUPS.find((g) => g.id === dayGroup);
        days = dg?.days || [];
      }

      for (const dayOfWeek of days) {
        // Проверка конфликта учителя
        const teacherConflict = await prisma.scheduleSlot.findFirst({
          where: {
            weekStartDate: weekStart,
            dayOfWeek,
            startTime: match.startTime!,
            teacherId: match.teacherId!,
          },
        });

        if (teacherConflict) {
          importErrors.push(
            `${match.teacherLabel} уже занят(а) в ${match.startTime} (день ${dayOfWeek})`
          );
          continue;
        }

        // Проверка конфликта ученика
        if (match.lessonType === "INDIVIDUAL" && match.studentId) {
          const studentConflict = await prisma.scheduleSlot.findFirst({
            where: {
              weekStartDate: weekStart,
              dayOfWeek,
              startTime: match.startTime!,
              studentId: match.studentId,
            },
          });

          if (studentConflict) {
            importErrors.push(
              `${match.studentOrGroupLabel} уже записан(а) на ${match.startTime} (день ${dayOfWeek})`
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
              dayOfWeek,
              startTime: match.startTime!,
              endTime: getEndTime(match.startTime!),
              weekStartDate: weekStart,
              lessonType: match.lessonType!,
              lessonCategory: match.lessonCategory || null,
              room: matchV2.room || null,
            },
          });
          created++;
        } catch (createError) {
          console.error("Ошибка создания слота:", createError);
          importErrors.push(`Ошибка создания: ${match.teacherLabel} ${match.startTime}`);
        }
      }
    }

    // Подсчёт ожидаемого количества
    let expectedTotal = 0;
    for (const match of validMatches) {
      const matchV2 = match as MatchedRowV2;
      if (result.detectedFormat === "v2-multiblock") {
        const dg = DAY_GROUPS.find((g) => g.id === matchV2.dayGroup);
        expectedTotal += dg?.days.length || 0;
      } else {
        const dg = DAY_GROUPS.find((g) => g.id === dayGroup);
        expectedTotal += dg?.days.length || 0;
      }
    }

    return NextResponse.json({
      count: created,
      total: expectedTotal,
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
