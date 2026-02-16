import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEndTime, DAY_GROUPS } from "@/lib/schedule-utils";
import {
  extractSheetId,
  buildCsvUrl,
  parseCsvToGrid,
  matchGrid,
} from "@/lib/import-utils";

// POST /api/schedule/import
// Body: { sheetUrl, weekStart, dayGroup: "mwf"|"tt", preview?: boolean }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sheetUrl, weekStart, dayGroup, preview } = body;

    if (!sheetUrl || !weekStart || !dayGroup) {
      return NextResponse.json(
        { error: "sheetUrl, weekStart и dayGroup обязательны" },
        { status: 400 }
      );
    }

    // Дни недели для выбранной группы
    const dg = DAY_GROUPS.find((g) => g.id === dayGroup);
    if (!dg) {
      return NextResponse.json(
        { error: "Неверная группа дней" },
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

    // 3. Парсинг CSV в сетку
    const grid = parseCsvToGrid(csvData);
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
    const result = matchGrid(grid, teachers, students, groups);

    if (result.totalRows === 0) {
      return NextResponse.json(
        { error: "Не найдено занятий. Проверьте формат: учителя в первой строке, время в первом столбце." },
        { status: 400 }
      );
    }

    // 6. Режим превью
    if (preview) {
      return NextResponse.json(result);
    }

    // 7. Режим импорта — создать слоты для КАЖДОГО дня в группе
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
      // Создаём слот для КАЖДОГО дня в группе (Пн+Ср+Пт или Вт+Чт)
      for (const dayOfWeek of dg.days) {
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
              room: null,
            },
          });
          created++;
        } catch (createError) {
          console.error("Ошибка создания слота:", createError);
          importErrors.push(`Ошибка создания: ${match.teacherLabel} ${match.startTime}`);
        }
      }
    }

    return NextResponse.json({
      count: created,
      total: validMatches.length * dg.days.length,
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
