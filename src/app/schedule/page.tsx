"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  TIME_SLOTS,
  DAY_GROUPS,
  LESSON_CATEGORIES,
  getMonday,
  addWeeks,
  formatWeekRange,
  getEndTime,
} from "@/lib/schedule-utils";
import type { ImportPreviewV2 } from "@/lib/import-utils";

interface Teacher {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string | null;
  room?: string | null;
}

interface Student {
  id: string;
  lastName: string;
  firstName: string;
}

interface GroupMember {
  id: string;
  student: Student;
}

interface Group {
  id: string;
  name: string;
  teacherId: string;
  members: GroupMember[];
}

interface ScheduleSlot {
  id: string;
  teacherId: string;
  studentId: string | null;
  groupId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  weekStartDate: string;
  lessonType: string;
  lessonCategory: string | null;
  room: string | null;
  teacher: Teacher;
  student: Student | null;
  group: (Group & { members: GroupMember[] }) | null;
}

// Сводка ошибок импорта
function ImportErrorSummary({ matches }: { matches: ImportPreviewV2["matches"] }) {
  const missingTeachers = new Set<string>();
  const missingStudents = new Set<string>();
  const missingGroups = new Set<string>();
  for (const m of matches) {
    for (const err of m.errors) {
      if (err.startsWith("Учитель не найден:")) {
        missingTeachers.add(err.replace(/^Учитель не найден:\s*"?|"?\s*$/g, ""));
      } else if (err.startsWith("Группа не найдена:")) {
        missingGroups.add(err.replace(/^Группа не найдена:\s*"?|"?\s*$/g, ""));
      } else if (err.startsWith("Не найден:")) {
        missingStudents.add(err.replace(/^Не найден:\s*"?|"?\s*$/g, ""));
      }
    }
  }
  if (missingTeachers.size === 0 && missingGroups.size === 0 && missingStudents.size === 0) return null;
  return (
    <div className="space-y-1 rounded border border-amber-200 bg-amber-50 p-3 text-xs">
      <p className="font-medium text-amber-800">Не найдено в базе данных:</p>
      {missingTeachers.size > 0 && (
        <p className="text-amber-700">
          <strong>Учителя ({missingTeachers.size}):</strong>{" "}
          {[...missingTeachers].join(", ")}
        </p>
      )}
      {missingGroups.size > 0 && (
        <p className="text-amber-700">
          <strong>Группы ({missingGroups.size}):</strong>{" "}
          {[...missingGroups].join(", ")}
        </p>
      )}
      {missingStudents.size > 0 && (
        <p className="text-amber-700">
          <strong>Ученики ({missingStudents.size}):</strong>{" "}
          {[...missingStudents].join(", ")}
        </p>
      )}
      <p className="mt-1 text-amber-600">
        Добавьте недостающих в соответствующих разделах, затем загрузите превью заново.
      </p>
    </div>
  );
}

// Цвета по типу занятия
function getCellStyle(slot: ScheduleSlot): string {
  const cat = slot.lessonCategory;
  if (cat === "Метод") return "bg-gray-200 text-gray-700";
  if (cat === "СОПР") return "bg-purple-100 text-purple-800";
  if (slot.lessonType === "GROUP") return "bg-green-100 text-green-800";
  if (cat === "И") return "bg-blue-100 text-blue-800";
  if (cat === "А") return "bg-amber-100 text-amber-800";
  if (cat === "Тех") return "bg-cyan-100 text-cyan-800";
  if (cat === "ДЗ") return "bg-orange-100 text-orange-800";
  if (cat === "РЛ") return "bg-rose-100 text-rose-800";
  if (cat === "каз") return "bg-teal-100 text-teal-800";
  if (cat === "МНО") return "bg-lime-100 text-lime-800";
  if (cat === "АФК") return "bg-emerald-100 text-emerald-800";
  return "bg-blue-50 text-blue-800";
}

function getSlotLabel(slot: ScheduleSlot): string {
  if (slot.lessonCategory === "Метод") return "метод";
  if (slot.lessonType === "GROUP" && slot.group) {
    return `гр${slot.group.name}`;
  }
  if (slot.lessonType === "INDIVIDUAL" && slot.student) {
    const suffix = slot.lessonCategory ? ` ${slot.lessonCategory}` : "";
    return `${slot.student.lastName}${suffix}`;
  }
  return "—";
}

export default function SchedulePage() {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [activeDayGroup, setActiveDayGroup] = useState("mwf");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);

  // Диалог добавления
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [selectedTime, setSelectedTime] = useState("09:00");
  const [formType, setFormType] = useState<"INDIVIDUAL" | "GROUP">("INDIVIDUAL");
  const [formStudent, setFormStudent] = useState("");
  const [formGroup, setFormGroup] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formRoom, setFormRoom] = useState("");
  const [error, setError] = useState("");
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);

  // Импорт из Google Sheets
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreviewV2 | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [importStage, setImportStage] = useState<"input" | "preview">("input");

  const currentDayGroup = DAY_GROUPS.find((dg) => dg.id === activeDayGroup)!;

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      weekStart,
      dayGroup: activeDayGroup,
    });
    const res = await fetch(`/api/schedule?${params}`);
    if (res.ok) {
      setSlots(await res.json());
    }
    setLoading(false);
  }, [weekStart, activeDayGroup]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  useEffect(() => {
    Promise.all([
      fetch("/api/teachers").then((r) => r.json()),
      fetch("/api/students").then((r) => r.json()),
      fetch("/api/groups").then((r) => r.json()),
    ]).then(([t, s, g]) => {
      setTeachers(t);
      setStudents(s);
      setGroups(g);
    });
  }, []);

  // Учителя, у которых есть слоты на этой неделе в текущей группе дней
  const activeTeachers = teachers.filter((t) =>
    slots.some((s) => s.teacherId === t.id)
  );

  // Если нет слотов — показать всех учителей
  const displayTeachers = activeTeachers.length > 0 ? activeTeachers : teachers;

  // Получить слот для ячейки
  const getSlotForCell = (teacherId: string, time: string): ScheduleSlot | undefined => {
    return slots.find(
      (s) => s.teacherId === teacherId && s.startTime === time
    );
  };

  const openAddDialog = (teacherId: string, time: string) => {
    setSelectedTeacherId(teacherId);
    setSelectedTime(time);
    setFormType("INDIVIDUAL");
    setFormStudent("");
    setFormGroup("");
    setFormCategory("");
    const teacher = teachers.find((t) => t.id === teacherId);
    setFormRoom(teacher?.room ?? "");
    setError("");
    setDialogOpen(true);
  };

  const handleAddSlot = async () => {
    setError("");
    // Для каждого дня в группе создаём слот
    const days = currentDayGroup.days;
    let lastError = "";
    let created = 0;

    for (const dayOfWeek of days) {
      const body: Record<string, unknown> = {
        teacherId: selectedTeacherId,
        dayOfWeek,
        startTime: selectedTime,
        endTime: getEndTime(selectedTime),
        weekStartDate: weekStart,
        lessonType: formType,
        lessonCategory: (formCategory && formCategory !== "__none__") ? formCategory : null,
        room: formRoom || null,
      };

      if (formType === "INDIVIDUAL") {
        if (formCategory === "Метод") {
          // Метод-слот без ученика
        } else {
          body.studentId = formStudent;
        }
      } else {
        body.groupId = formGroup;
      }

      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        lastError = data.error || "Ошибка при создании";
      } else {
        created++;
      }
    }

    if (created === 0) {
      setError(lastError);
      return;
    }

    setDialogOpen(false);
    fetchSlots();
  };

  const handleDeleteSlot = async (slotId: string) => {
    if (!confirm("Удалить этот слот?")) return;
    await fetch(`/api/schedule/${slotId}`, { method: "DELETE" });
    fetchSlots();
  };

  const handleCopyWeek = async () => {
    const fromWeek = addWeeks(weekStart, -1);
    const res = await fetch("/api/schedule/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromWeek, toWeek: weekStart }),
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Ошибка");
    } else {
      const data = await res.json();
      alert(`Скопировано ${data.count} слотов`);
      fetchSlots();
    }
    setCopyDialogOpen(false);
  };

  const openImportDialog = () => {
    setImportUrl("");
    setImportPreview(null);
    setImportError("");
    setImportStage("input");
    setImportDialogOpen(true);
  };

  const handleLoadPreview = async () => {
    setImportLoading(true);
    setImportError("");

    try {
      const res = await fetch("/api/schedule/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: importUrl, weekStart, dayGroup: activeDayGroup, preview: true }),
      });

      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error || "Ошибка загрузки");
        setImportLoading(false);
        return;
      }

      setImportPreview(data as ImportPreviewV2);
      setImportStage("preview");
    } catch {
      setImportError("Ошибка сети");
    }
    setImportLoading(false);
  };

  const handleConfirmImport = async () => {
    setImportLoading(true);
    setImportError("");

    try {
      // Для v2 формата dayGroup не нужен (определяется из таблицы)
      const isV2 = importPreview?.detectedFormat === "v2-multiblock";
      const importBody: Record<string, unknown> = {
        sheetUrl: importUrl,
        weekStart,
        preview: false,
      };
      if (!isV2) {
        importBody.dayGroup = activeDayGroup;
      }

      const res = await fetch("/api/schedule/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(importBody),
      });

      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error || "Ошибка импорта");
        setImportLoading(false);
        return;
      }

      const msg = `Импортировано ${data.count} из ${data.total} занятий`;
      const errMsg = data.errors?.length
        ? `\n\nПропущено:\n${data.errors.join("\n")}`
        : "";
      alert(msg + errMsg);
      setImportDialogOpen(false);
      fetchSlots();
    } catch {
      setImportError("Ошибка сети");
    }
    setImportLoading(false);
  };

  return (
    <div>
      {/* Заголовок */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Расписание</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openImportDialog}>
            Импорт из Google Sheets
          </Button>
          <Button variant="outline" onClick={() => setCopyDialogOpen(true)}>
            Копировать с пред. недели
          </Button>
        </div>
      </div>

      {/* Навигация по неделям */}
      <div className="mb-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart(addWeeks(weekStart, -1))}
          >
            &larr;
          </Button>
          <span className="min-w-[160px] text-center font-medium">
            {formatWeekRange(weekStart)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart(addWeeks(weekStart, 1))}
          >
            &rarr;
          </Button>
        </div>
      </div>

      {/* Табы дней */}
      <div className="mb-4 flex gap-1">
        {DAY_GROUPS.map((dg) => (
          <button
            key={dg.id}
            onClick={() => setActiveDayGroup(dg.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeDayGroup === dg.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {dg.label}
          </button>
        ))}
      </div>

      {/* Сетка расписания: учителя-колонки, время-строки */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-r bg-gray-50 p-2 text-left text-xs font-medium text-gray-500" style={{ minWidth: 60 }}>
                  Время
                </th>
                {displayTeachers.map((teacher) => (
                  <th
                    key={teacher.id}
                    className="border-b border-r bg-gray-50 p-2 text-center text-xs font-medium text-gray-700"
                    style={{ minWidth: 110 }}
                  >
                    <div>{teacher.firstName} {teacher.lastName[0]}.</div>
                    {teacher.room && (
                      <div className="text-[10px] font-normal text-gray-400">
                        {teacher.room}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map((time) => (
                <tr key={time}>
                  <td className="sticky left-0 z-10 border-b border-r bg-white p-2 text-xs font-medium text-gray-500">
                    {time}
                  </td>
                  {displayTeachers.map((teacher) => {
                    const slot = getSlotForCell(teacher.id, time);
                    return (
                      <td
                        key={teacher.id}
                        className="border-b border-r p-1 align-top"
                        style={{ minWidth: 110, height: 44 }}
                      >
                        {slot ? (
                          <div
                            className={`cursor-pointer rounded px-2 py-1 text-xs ${getCellStyle(slot)}`}
                            onClick={() => handleDeleteSlot(slot.id)}
                            title={`${getSlotLabel(slot)}${slot.room ? ` | ${slot.room}` : ""}\nНажмите для удаления`}
                          >
                            <div className="font-medium truncate">
                              {getSlotLabel(slot)}
                            </div>
                          </div>
                        ) : (
                          <button
                            className="flex h-full w-full min-h-[32px] items-center justify-center rounded border border-dashed border-gray-200 text-gray-300 hover:border-gray-400 hover:text-gray-500 text-xs"
                            onClick={() => openAddDialog(teacher.id, time)}
                          >
                            +
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Легенда */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Badge variant="secondary" className="bg-blue-100 text-blue-800">И — Интенсив</Badge>
        <Badge variant="secondary" className="bg-amber-100 text-amber-800">А — Академические</Badge>
        <Badge variant="secondary" className="bg-cyan-100 text-cyan-800">Тех — Технология</Badge>
        <Badge variant="secondary" className="bg-green-100 text-green-800">Группа</Badge>
        <Badge variant="secondary" className="bg-purple-100 text-purple-800">СОПР</Badge>
        <Badge variant="secondary" className="bg-gray-200 text-gray-700">Метод</Badge>
        <Badge variant="secondary" className="bg-orange-100 text-orange-800">ДЗ</Badge>
        <Badge variant="secondary" className="bg-rose-100 text-rose-800">РЛ</Badge>
        <Badge variant="secondary" className="bg-teal-100 text-teal-800">каз</Badge>
        <Badge variant="secondary" className="bg-lime-100 text-lime-800">МНО</Badge>
        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">АФК</Badge>
      </div>

      {/* Диалог добавления слота */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Добавить занятие — {selectedTime}
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({currentDayGroup.label})
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {error && (
              <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Категория занятия */}
            <div>
              <label className="mb-1 block text-sm font-medium">Категория</label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите категорию" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Без категории</SelectItem>
                  {LESSON_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.value} — {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Тип занятия (если не Метод) */}
            {formCategory !== "Метод" && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium">Тип занятия</label>
                  <Select
                    value={formType}
                    onValueChange={(v) => setFormType(v as "INDIVIDUAL" | "GROUP")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INDIVIDUAL">Индивидуальное</SelectItem>
                      <SelectItem value="GROUP">Групповое</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formType === "INDIVIDUAL" ? (
                  <div>
                    <label className="mb-1 block text-sm font-medium">Ученик</label>
                    <Select value={formStudent} onValueChange={setFormStudent}>
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите ученика" />
                      </SelectTrigger>
                      <SelectContent>
                        {students.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.lastName} {s.firstName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <label className="mb-1 block text-sm font-medium">Группа</label>
                    <Select value={formGroup} onValueChange={setFormGroup}>
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите группу" />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name} ({g.members?.length || 0} уч.)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            {/* Кабинет */}
            <div>
              <label className="mb-1 block text-sm font-medium">Кабинет</label>
              <input
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                value={formRoom}
                onChange={(e) => setFormRoom(e.target.value)}
                placeholder="Каб.1"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Отмена
              </Button>
              <Button onClick={handleAddSlot}>
                Добавить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Диалог копирования */}
      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Копировать расписание</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Скопировать расписание с недели{" "}
            <strong>{formatWeekRange(addWeeks(weekStart, -1))}</strong> на текущую
            неделю <strong>{formatWeekRange(weekStart)}</strong>?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleCopyWeek}>Копировать</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Диалог импорта из Google Sheets */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Импорт из Google Sheets</DialogTitle>
          </DialogHeader>

          {importError && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-600">
              {importError}
            </div>
          )}

          {importStage === "input" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Вставьте ссылку на Google Таблицу с расписанием. Таблица должна быть открыта для просмотра по ссылке.
              </p>

              <div className="rounded border bg-gray-50 p-3 text-xs text-gray-500">
                <p className="mb-1 font-medium">Поддерживаемые форматы:</p>
                <p className="mt-1">1. <strong>Многоблочный</strong> — учителя по 2 колонки (пн/ср/пт + вт/чт), блоки через пустые строки</p>
                <p>2. <strong>Простой</strong> — одна колонка на учителя, группа дней выбирается вручную</p>
                <p className="mt-2">Формат определяется автоматически.</p>
              </div>

              <input
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
              />

              <p className="text-xs text-gray-400">
                Импорт на неделю <strong>{formatWeekRange(weekStart)}</strong>
              </p>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                  Отмена
                </Button>
                <Button onClick={handleLoadPreview} disabled={!importUrl.trim() || importLoading}>
                  {importLoading ? "Загрузка..." : "Загрузить превью"}
                </Button>
              </div>
            </div>
          )}

          {importStage === "preview" && importPreview && (
            <div className="space-y-4">
              {/* Формат и сводка */}
              <div className="flex flex-wrap gap-3">
                {importPreview.detectedFormat === "v2-multiblock" ? (
                  <div className="rounded bg-blue-100 px-3 py-1 text-sm text-blue-800">
                    Многоблочный ({importPreview.blocksDetected} бл., {importPreview.teachersDetected.length} уч.)
                  </div>
                ) : (
                  <div className="rounded bg-gray-100 px-3 py-1 text-sm">
                    Простой формат
                  </div>
                )}
                <div className="rounded bg-gray-100 px-3 py-1 text-sm">
                  Всего: <strong>{importPreview.totalRows}</strong>
                </div>
                <div className="rounded bg-green-100 px-3 py-1 text-sm text-green-800">
                  Валидных: <strong>{importPreview.validRows}</strong>
                </div>
                {importPreview.errorRows > 0 && (
                  <div className="rounded bg-red-100 px-3 py-1 text-sm text-red-800">
                    Ошибок: <strong>{importPreview.errorRows}</strong>
                  </div>
                )}
              </div>

              {importPreview.detectedFormat === "v2-multiblock" && (
                <p className="text-xs text-gray-500">
                  Обе группы дней (Пн/Ср/Пт и Вт/Чт) импортируются из таблицы автоматически.
                </p>
              )}

              {/* Сводка ошибок — какие сущности не найдены */}
              {importPreview.errorRows > 0 && <ImportErrorSummary matches={importPreview.matches} />}

              {/* Таблица превью */}
              <div className="max-h-[400px] overflow-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="border-b p-2 text-left">Время</th>
                      <th className="border-b p-2 text-left">Учитель</th>
                      <th className="border-b p-2 text-left">Ячейка</th>
                      {importPreview.detectedFormat === "v2-multiblock" && (
                        <>
                          <th className="border-b p-2 text-left">Дни</th>
                          <th className="border-b p-2 text-left">Каб</th>
                        </>
                      )}
                      <th className="border-b p-2 text-left">Результат</th>
                      <th className="border-b p-2 text-left">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.matches.map((m, i) => {
                      const mv2 = m as ImportPreviewV2["matches"][number];
                      return (
                        <tr
                          key={i}
                          className={m.errors.length > 0 ? "bg-red-50" : "bg-green-50"}
                        >
                          <td className="border-b p-2">{m.cell.time}</td>
                          <td className="border-b p-2">
                            {m.teacherLabel || (
                              <span className="text-red-500">{m.cell.teacherName}</span>
                            )}
                          </td>
                          <td className="border-b p-2 text-gray-500 max-w-[120px] truncate" title={m.cell.cellValue}>
                            {m.cell.cellValue}
                          </td>
                          {importPreview.detectedFormat === "v2-multiblock" && (
                            <>
                              <td className="border-b p-2 text-gray-500">
                                {mv2.dayGroup === "mwf" ? "Пн/Ср/Пт" : "Вт/Чт"}
                              </td>
                              <td className="border-b p-2 text-gray-400">
                                {mv2.room || "—"}
                              </td>
                            </>
                          )}
                          <td className="border-b p-2">
                            {m.studentOrGroupLabel || "—"}
                            {m.lessonCategory && (
                              <span className="ml-1 text-gray-400">{m.lessonCategory}</span>
                            )}
                          </td>
                          <td className="border-b p-2">
                            {m.errors.length > 0 ? (
                              <span className="text-red-600" title={m.errors.join("\n")}>
                                {m.errors[0]}
                              </span>
                            ) : (
                              <span className="text-green-600">OK</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setImportStage("input");
                    setImportPreview(null);
                    setImportError("");
                  }}
                >
                  Назад
                </Button>
                <Button
                  onClick={handleConfirmImport}
                  disabled={importPreview.validRows === 0 || importLoading}
                >
                  {importLoading
                    ? "Импорт..."
                    : `Импортировать ${importPreview.validRows} занятий`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
