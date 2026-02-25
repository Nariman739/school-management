import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEndTime, DAY_GROUPS } from "@/lib/schedule-utils";
import {
  extractSheetId,
  buildCsvUrl,
  parseCsvToGrid,
  matchGridV2,
  detectFormat,
} from "@/lib/import-utils";
import type { ImportPreviewV2, MatchedRowV2 } from "@/lib/import-utils";

// POST /api/schedule/import
// Body: { sheetUrl, weekStart, dayGroup?: "mwf"|"tt", preview?: boolean }
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
    const gridWithEmpty = parseCsvToGrid(csvData, true);
    const format = detectFormat(gridWithEmpty);

    if (format === "v1-simple" && !dayGroup) {
      return NextResponse.json(
        { error: "Для простого формата выберите группу дней (Пн/Ср/Пт или Вт/Чт)" },
        { status: 400 }
      );
    }

    const grid = format === "v2-multiblock" ? gridWithEmpty : parseCsvToGrid(csvData);

    if (grid.length < 2) {
      return NextResponse.json(
        { error: "Таблица пустая. Нужна строка с учителями и хотя бы одна строка с временем." },
        { status: 400 }
      );
    }

    // 4. Загрузить данные из БД (включая сохранённые псевдонимы)
    const [teachers, students, groups, savedAliases] = await Promise.all([
      prisma.teacher.findMany({ where: { isActive: true } }),
      prisma.student.findMany({ where: { isActive: true } }),
      prisma.group.findMany(),
      prisma.nameAlias.findMany(),
    ]);

    // 5. Матчинг
    const result = matchGridV2(grid, teachers, students, groups, format) as ImportPreviewV2;

    if (result.totalRows === 0) {
      return NextResponse.json(
        { error: "Не найдено занятий. Проверьте формат таблицы." },
        { status: 400 }
      );
    }

    // 6. Применить сохранённые псевдонимы к строкам с ошибками
    if (savedAliases.length > 0) {
      const teacherAliasMap = new Map(
        savedAliases.filter((a) => a.type === "teacher").map((a) => [a.alias, a.entityId])
      );
      const studentAliasMap = new Map(
        savedAliases.filter((a) => a.type === "student").map((a) => [a.alias, a.entityId])
      );
      const groupAliasMap = new Map(
        savedAliases.filter((a) => a.type === "group").map((a) => [a.alias, a.entityId])
      );

      for (const match of result.matches) {
        if (match.errors.length === 0) continue;

        // Исправить ошибку учителя
        const hasTeacherError = match.errors.some((e) => e.startsWith("Учитель не найден"));
        if (hasTeacherError) {
          const aliasId = teacherAliasMap.get(match.cell.teacherName);
          if (aliasId) {
            const teacher = teachers.find((t) => t.id === aliasId);
            if (teacher) {
              match.teacherId = teacher.id;
              match.teacherLabel = `${teacher.lastName} ${teacher.firstName}`;
              match.errors = match.errors.filter((e) => !e.startsWith("Учитель не найден"));
            }
          }
        }

        // Исправить ошибку ученика/группы
        const hasStudentError = match.errors.some(
          (e) => e.startsWith("Не найден") || e.startsWith("Группа не найдена")
        );
        if (hasStudentError) {
          const cellValue = match.cell.cellValue;
          const studentId = studentAliasMap.get(cellValue);
          const groupId = groupAliasMap.get(cellValue);

          if (studentId) {
            const student = students.find((s) => s.id === studentId);
            if (student) {
              match.studentId = student.id;
              match.studentOrGroupLabel = `${student.lastName} ${student.firstName}`;
              match.lessonType = "INDIVIDUAL";
              match.errors = match.errors.filter(
                (e) => !e.startsWith("Не найден") && !e.startsWith("Группа не найдена")
              );
            }
          } else if (groupId) {
            const group = groups.find((g) => g.id === groupId);
            if (group) {
              match.groupId = group.id;
              match.studentOrGroupLabel = `гр ${group.name}`;
              match.lessonType = "GROUP";
              match.errors = match.errors.filter(
                (e) => !e.startsWith("Не найден") && !e.startsWith("Группа не найдена")
              );
            }
          }
        }
      }

      // Пересчитать после применения псевдонимов
      result.validRows = result.matches.filter((m) => m.errors.length === 0).length;
      result.errorRows = result.matches.length - result.validRows;
    }

    // 7. Режим превью — вернуть результат матчинга
    if (preview) {
      return NextResponse.json(result);
    }

    // 8. Режим импорта (прямой, без ручного сопоставления) — создать валидные слоты
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
      const dg = DAY_GROUPS.find((g) =>
        result.detectedFormat === "v2-multiblock" ? g.id === matchV2.dayGroup : g.id === dayGroup
      );
      const days = dg?.days ?? [];

      for (const dayOfWeek of days) {
        const teacherConflict = await prisma.scheduleSlot.findFirst({
          where: {
            weekStartDate: weekStart,
            dayOfWeek,
            startTime: match.startTime!,
            teacherId: match.teacherId!,
          },
        });

        if (teacherConflict) {
          importErrors.push(`${match.teacherLabel} занят в ${match.startTime} (день ${dayOfWeek})`);
          continue;
        }

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
            importErrors.push(`${match.studentOrGroupLabel} занят в ${match.startTime} (день ${dayOfWeek})`);
            continue;
          }
        }

        try {
          await prisma.scheduleSlot.create({
            data: {
              teacherId: match.teacherId!,
              studentId: match.studentId ?? null,
              groupId: match.groupId ?? null,
              dayOfWeek,
              startTime: match.startTime!,
              endTime: getEndTime(match.startTime!),
              weekStartDate: weekStart,
              lessonType: match.lessonType!,
              lessonCategory: match.lessonCategory ?? null,
              room: matchV2.room ?? null,
            },
          });
          created++;
        } catch (createError) {
          console.error("Ошибка создания слота:", createError);
          importErrors.push(`Ошибка: ${match.teacherLabel} ${match.startTime}`);
        }
      }
    }

    let expectedTotal = 0;
    for (const match of validMatches) {
      const matchV2 = match as MatchedRowV2;
      const dg = DAY_GROUPS.find((g) =>
        result.detectedFormat === "v2-multiblock" ? g.id === matchV2.dayGroup : g.id === dayGroup
      );
      expectedTotal += dg?.days.length ?? 0;
    }

    return NextResponse.json({ count: created, total: expectedTotal, errors: importErrors });
  } catch (error) {
    console.error("Ошибка импорта расписания:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
