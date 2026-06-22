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
  DAYS_OF_WEEK,
  LESSON_CATEGORIES,
  getMonday,
  addWeeks,
  formatWeekRange,
  getEndTime,
} from "@/lib/schedule-utils";
import type { ImportPreviewV2, MatchedRowV2 } from "@/lib/import-utils";

// Ручное сопоставление строк импорта (когда fuzzy match не нашёл)
interface RowResolution {
  teacherId?: string;
  teacherLabel?: string;
  studentId?: string | null;
  groupId?: string | null;
  entityLabel?: string; // подпись для ученика/группы
}

interface PendingAlias {
  alias: string;
  type: "student" | "teacher" | "group";
  entityId: string;
  label: string;
}

interface Teacher {
  id: string;
  teacherNumber?: number | null;
  lastName: string;
  firstName: string;
  patronymic: string | null;
  room?: string | null;
}

interface Student {
  id: string;
  lastName: string;
  firstName: string;
  studentNumber?: number | null;
}

interface GroupMember {
  id: string;
  student: Student;
}

interface Group {
  id: string;
  name: string | null;
  groupType?: "INDIVIDUAL" | "PAIR" | "GROUP";
  displayName?: string | null;
  teacherId: string;
  members: GroupMember[];
}

interface SlotAttendee {
  id: string;
  slotId: string;
  studentId: string;
  student: {
    lastName: string;
    firstName: string;
  };
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
  attendees?: SlotAttendee[];
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

// Формат ID ученика для отображения в расписании: «001», «042», «112»…
// Дархан в фидбеке 12.06 просил убрать букву фамилии и показывать ID,
// чтобы избежать путаницы между одноимёнными детьми.
function formatStudentId(num?: number | null): string {
  if (num == null) return "";
  return num.toString().padStart(3, "0");
}

function studentDisplay(s: { firstName: string; lastName: string; studentNumber?: number | null }): string {
  const id = formatStudentId(s.studentNumber);
  return id ? `${s.firstName} ${id}` : `${s.firstName} ${s.lastName[0] ?? ""}.`;
}

function getSlotLabel(slot: ScheduleSlot): string {
  if (slot.lessonCategory === "Метод") return "метод";
  if (slot.lessonType === "GROUP" && slot.group) {
    if (slot.group.groupType === "PAIR" || !slot.group.name) {
      const members = slot.group.members?.map((m) => studentDisplay(m.student)).join(" + ");
      return members ? `пара ${members}` : "пара";
    }
    return `гр${slot.group.name}`;
  }
  if (slot.lessonType === "INDIVIDUAL" && slot.student) {
    const suffix = slot.lessonCategory ? ` ${slot.lessonCategory}` : "";
    return `${studentDisplay(slot.student)}${suffix}`;
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
  const [formType, setFormType] = useState<"INDIVIDUAL" | "PAIR" | "GROUP">("INDIVIDUAL");
  const [formStudent, setFormStudent] = useState("");
  const [formGroup, setFormGroup] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formRoom, setFormRoom] = useState("");
  const [formServiceTypeId, setFormServiceTypeId] = useState("");
  // Создание новой пары прямо из диалога расписания
  const [newPairOpen, setNewPairOpen] = useState(false);
  const [newPairStudent1, setNewPairStudent1] = useState("");
  const [newPairStudent2, setNewPairStudent2] = useState("");
  const [newPairError, setNewPairError] = useState("");
  const [newPairSaving, setNewPairSaving] = useState(false);
  const [services, setServices] = useState<{ id: string; name: string; kind: string; isActive: boolean; sortOrder: number }[]>([]);
  const [error, setError] = useState("");
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [extendDialogOpen, setExtendDialogOpen] = useState(false);
  const [extendWeeks, setExtendWeeks] = useState(4);
  const [freezeDialogOpen, setFreezeDialogOpen] = useState(false);
  const [freezeStart, setFreezeStart] = useState("");
  const [freezeEnd, setFreezeEnd] = useState("");
  const [freezeReason, setFreezeReason] = useState("");

  // Диалог редактирования состава группового/парного слота
  const [attendeesDialogOpen, setAttendeesDialogOpen] = useState(false);
  const [attendeesSlot, setAttendeesSlot] = useState<ScheduleSlot | null>(null);
  const [attendeesSelected, setAttendeesSelected] = useState<Set<string>>(new Set());
  const [attendeesSaving, setAttendeesSaving] = useState(false);
  const [attendeesError, setAttendeesError] = useState("");

  // Импорт из Google Sheets / xlsx
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreviewV2 | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [importStage, setImportStage] = useState<"input" | "preview">("input");
  // Для xlsx-загрузки: список листов и выбранный
  const [importSheets, setImportSheets] = useState<string[] | null>(null);
  const [importSelectedSheet, setImportSelectedSheet] = useState<string>("");
  const [importWorkbookFile, setImportWorkbookFile] = useState<File | null>(null);
  // Ручное сопоставление: index строки → что выбрал пользователь
  const [resolutions, setResolutions] = useState<Map<number, RowResolution>>(new Map());
  // Диалог сохранения псевдонимов после импорта
  const [saveAliasesOpen, setSaveAliasesOpen] = useState(false);
  const [pendingAliases, setPendingAliases] = useState<PendingAlias[]>([]);

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
      fetch("/api/services").then((r) => r.json()).catch(() => []),
    ]).then(([t, s, g, svc]) => {
      setTeachers(t);
      setStudents(s);
      setGroups(g);
      setServices(Array.isArray(svc) ? svc.filter((x: { isActive: boolean }) => x.isActive) : []);
    });
  }, []);

  // Показываем всех учителей: сначала тех у кого есть слоты на этой неделе,
  // затем остальных активных — чтобы можно было добавить занятие в пустую колонку.
  const teachersWithSlots = teachers.filter((t) =>
    slots.some((s) => s.teacherId === t.id)
  );
  const teachersWithoutSlots = teachers.filter(
    (t) => !slots.some((s) => s.teacherId === t.id)
  );
  const displayTeachers = [...teachersWithSlots, ...teachersWithoutSlots];

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
    setFormServiceTypeId("");
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
      // PAIR на бэке тоже хранится как ScheduleSlot с lessonType=GROUP + groupId=Group(groupType=PAIR)
      const lessonTypeForBackend = formType === "PAIR" ? "GROUP" : formType;

      const body: Record<string, unknown> = {
        teacherId: selectedTeacherId,
        dayOfWeek,
        startTime: selectedTime,
        endTime: getEndTime(selectedTime),
        weekStartDate: weekStart,
        lessonType: lessonTypeForBackend,
        lessonCategory: (formCategory && formCategory !== "__none__") ? formCategory : null,
        room: formRoom || null,
        serviceTypeId: formServiceTypeId || null,
      };

      if (formType === "INDIVIDUAL") {
        if (formCategory === "Метод") {
          // Метод-слот без ученика
        } else {
          body.studentId = formStudent;
        }
      } else {
        // GROUP / PAIR — оба используют formGroup (id выбранной группы или созданной пары)
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
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;

    // Слот создаётся сразу для всех дней группы (Пн/Ср/Пт или Вт/Чт),
    // поэтому удаляем все парные слоты с тем же teacher+time на этой неделе.
    const slotsToDelete = slots.filter(
      (s) =>
        s.teacherId === slot.teacherId &&
        s.startTime === slot.startTime &&
        currentDayGroup.days.includes(s.dayOfWeek)
    );

    const dayLabel = currentDayGroup.label;
    const confirmMsg =
      slotsToDelete.length > 1
        ? `Удалить занятие во все дни (${dayLabel})? Будет удалено ${slotsToDelete.length} слот(ов).`
        : "Удалить этот слот?";
    if (!confirm(confirmMsg)) return;

    const results = await Promise.all(
      slotsToDelete.map((s) =>
        fetch(`/api/schedule/${s.id}`, { method: "DELETE" })
      )
    );

    const failed = results.filter((r) => !r.ok).length;
    if (failed > 0) {
      alert(`Не удалось удалить ${failed} из ${slotsToDelete.length} слотов`);
    }

    fetchSlots();
  };

  const openAttendeesDialog = (slot: ScheduleSlot) => {
    if (!slot.group) return;
    setAttendeesSlot(slot);
    setAttendeesError("");
    const memberIds = slot.group.members.map((m) => m.student.id);
    if (slot.attendees && slot.attendees.length > 0) {
      setAttendeesSelected(new Set(slot.attendees.map((a) => a.studentId)));
    } else {
      // По умолчанию все члены группы посещают
      setAttendeesSelected(new Set(memberIds));
    }
    setAttendeesDialogOpen(true);
  };

  const handleSaveAttendees = async () => {
    if (!attendeesSlot) return;
    setAttendeesSaving(true);
    setAttendeesError("");
    try {
      const res = await fetch(`/api/schedule/${attendeesSlot.id}/attendees`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentIds: [...attendeesSelected] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAttendeesError(data?.error || "Не удалось сохранить");
        return;
      }
      setAttendeesDialogOpen(false);
      setAttendeesSlot(null);
      fetchSlots();
    } finally {
      setAttendeesSaving(false);
    }
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

  const handleExtend = async () => {
    const res = await fetch("/api/schedule/extend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromWeek: weekStart, weeks: extendWeeks }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Ошибка");
    } else {
      const msg = data.skippedWeeks?.length > 0
        ? `Создано ${data.totalCreated} слотов. Пропущено ${data.skippedWeeks.length} недель (уже есть расписание).`
        : `Создано ${data.totalCreated} слотов на ${extendWeeks} недель вперёд.`;
      alert(msg);
    }
    setExtendDialogOpen(false);
  };

  const handleFreeze = async () => {
    if (!freezeStart || !freezeEnd || !freezeReason) {
      alert("Заполните все поля");
      return;
    }
    const res = await fetch("/api/schedule/freeze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: freezeStart, endDate: freezeEnd, reason: freezeReason }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Ошибка");
    } else {
      alert(`Заморозка создана. Отменено ${data.cancelled} занятий.`);
      fetchSlots();
    }
    setFreezeDialogOpen(false);
    setFreezeStart("");
    setFreezeEnd("");
    setFreezeReason("");
  };

  const openImportDialog = () => {
    setImportUrl("");
    setImportPreview(null);
    setImportError("");
    setImportStage("input");
    setResolutions(new Map());
    setImportSheets(null);
    setImportSelectedSheet("");
    setImportWorkbookFile(null);
    setImportDialogOpen(true);
  };

  const handleSelectXlsxFile = async (file: File) => {
    setImportError("");
    setImportLoading(true);
    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      setImportWorkbookFile(file);
      setImportSheets(wb.SheetNames);
      // Авто-выбор: если только один лист или есть имя похожее на текущую неделю
      const fallback = wb.SheetNames[0];
      setImportSelectedSheet(fallback);
    } catch (e) {
      console.error(e);
      setImportError("Не удалось прочитать файл");
    } finally {
      setImportLoading(false);
    }
  };

  const buildGridFromXlsx = async (
    file: File,
    sheetName: string,
  ): Promise<string[][]> => {
    const XLSX = await import("xlsx");
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: "array" });
    const ws = wb.Sheets[sheetName];
    const grid: unknown[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];
    return grid.map((row) => row.map((c) => (c == null ? "" : String(c))));
  };

  const handleLoadPreview = async () => {
    setImportLoading(true);
    setImportError("");

    try {
      // Из xlsx → собираем grid на клиенте, шлём в API готовым
      const useXlsx = !!importWorkbookFile && !!importSelectedSheet;
      const body: Record<string, unknown> = {
        weekStart,
        dayGroup: activeDayGroup,
        preview: true,
      };

      if (useXlsx) {
        body.gridData = await buildGridFromXlsx(importWorkbookFile!, importSelectedSheet);
      } else {
        body.sheetUrl = importUrl;
      }

      const res = await fetch("/api/schedule/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
    if (!importPreview) return;
    setImportLoading(true);
    setImportError("");

    try {
      type SlotToCreate = {
        teacherId: string;
        studentId?: string | null;
        groupId?: string | null;
        startTime: string;
        dayGroup: "mwf" | "tt" | "sat";
        lessonType: string;
        lessonCategory?: string | null;
        room?: string | null;
      };

      const slotsToCreate: SlotToCreate[] = [];
      const newAliases: PendingAlias[] = [];

      for (let i = 0; i < importPreview.matches.length; i++) {
        const m = importPreview.matches[i] as MatchedRowV2;
        const r = resolutions.get(i);

        const hasTeacherError = m.errors.some((e) => e.startsWith("Учитель не найден"));
        const hasStudentError = m.errors.some(
          (e) => e.startsWith("Не найден") || e.startsWith("Группа не найдена")
        );

        // Пропускаем строки с нерешёнными ошибками
        if (hasTeacherError && !r?.teacherId) continue;
        if (hasStudentError && !r?.studentId && !r?.groupId) {
          if (m.errors.length > 0) continue;
        }

        // Определяем teacherId
        const teacherId = r?.teacherId ?? m.teacherId;
        if (!teacherId) continue;

        // Если учитель был найден вручную — сохраняем псевдоним
        if (r?.teacherId) {
          newAliases.push({
            alias: m.cell.teacherName,
            type: "teacher",
            entityId: r.teacherId,
            label: r.teacherLabel ?? r.teacherId,
          });
        }

        // Определяем studentId/groupId
        let studentId = m.studentId ?? null;
        let groupId = m.groupId ?? null;
        let lessonType = m.lessonType ?? "INDIVIDUAL";

        if (r?.studentId !== undefined) {
          studentId = r.studentId;
          groupId = null;
          lessonType = "INDIVIDUAL";
          if (r.studentId) {
            newAliases.push({
              alias: m.cell.cellValue,
              type: "student",
              entityId: r.studentId,
              label: r.entityLabel ?? r.studentId,
            });
          }
        } else if (r?.groupId !== undefined) {
          groupId = r.groupId;
          studentId = null;
          lessonType = "GROUP";
          if (r.groupId) {
            newAliases.push({
              alias: m.cell.cellValue,
              type: "group",
              entityId: r.groupId,
              label: r.entityLabel ?? r.groupId,
            });
          }
        }

        slotsToCreate.push({
          teacherId,
          studentId,
          groupId,
          startTime: m.startTime!,
          // v3-saturday: парсер выставляет dayGroup="mwf" как placeholder, но семантически
          // это суббота. Переопределяем здесь.
          dayGroup: importPreview.detectedFormat === "v3-saturday" ? "sat" : m.dayGroup,
          lessonType,
          lessonCategory: m.lessonCategory ?? null,
          room: m.room ?? null,
        });
      }

      if (slotsToCreate.length === 0) {
        setImportError("Нет слотов для импорта. Исправьте ошибки в таблице ниже.");
        setImportLoading(false);
        return;
      }

      const res = await fetch("/api/schedule/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots: slotsToCreate, weekStart }),
      });

      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error || "Ошибка импорта");
        setImportLoading(false);
        return;
      }

      setImportDialogOpen(false);
      setResolutions(new Map());
      fetchSlots();

      // Предлагаем сохранить псевдонимы для следующего импорта
      if (newAliases.length > 0) {
        setPendingAliases(newAliases);
        setSaveAliasesOpen(true);
      } else {
        alert(`Импортировано ${data.count} занятий`);
      }
    } catch {
      setImportError("Ошибка сети");
    }
    setImportLoading(false);
  };

  const handleSaveAliases = async () => {
    try {
      await fetch("/api/name-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aliases: pendingAliases.map((a) => ({
            alias: a.alias,
            type: a.type,
            entityId: a.entityId,
          })),
        }),
      });
    } catch {
      console.error("Ошибка сохранения псевдонимов");
    }
    setSaveAliasesOpen(false);
    setPendingAliases([]);
  };

  // Сколько строк будет импортировано (автоматически + вручную)
  const resolvedManuallyCount = importPreview
    ? [...resolutions.keys()].filter((i) => {
        const m = importPreview.matches[i];
        if (!m || m.errors.length === 0) return false;
        const r = resolutions.get(i)!;
        const hasTeacherErr = m.errors.some((e) => e.startsWith("Учитель не найден"));
        const hasStudentErr = m.errors.some(
          (e) => e.startsWith("Не найден") || e.startsWith("Группа не найдена")
        );
        return (!hasTeacherErr || !!r.teacherId) && (!hasStudentErr || !!r.studentId || !!r.groupId);
      }).length
    : 0;
  const totalToImport = (importPreview?.validRows ?? 0) + resolvedManuallyCount;

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
          <Button variant="outline" onClick={() => setExtendDialogOpen(true)}>
            Продлить
          </Button>
          <Button variant="outline" onClick={() => setFreezeDialogOpen(true)}>
            Заморозка
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
                    <div>
                      {teacher.firstName}{" "}
                      {teacher.teacherNumber != null
                        ? teacher.teacherNumber.toString().padStart(2, "0")
                        : `${teacher.lastName[0] ?? ""}.`}
                    </div>
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
                            className={`relative rounded px-2 py-1 text-xs ${getCellStyle(slot)}`}
                            title={`${getSlotLabel(slot)}${slot.room ? ` | ${slot.room}` : ""}`}
                          >
                            <div
                              className="cursor-pointer font-medium truncate pr-10"
                              onClick={() => handleDeleteSlot(slot.id)}
                              title="Нажмите для удаления"
                            >
                              {getSlotLabel(slot)}
                            </div>
                            {slot.lessonType === "GROUP" && slot.group && (
                              <button
                                type="button"
                                className="absolute right-1 top-1/2 -translate-y-1/2 rounded bg-white/70 px-1 py-0.5 text-[9px] font-medium text-gray-700 hover:bg-white"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAttendeesDialog(slot);
                                }}
                                title="Изменить состав занятия"
                              >
                                Состав
                              </button>
                            )}
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
                    onValueChange={(v) => {
                      setFormType(v as "INDIVIDUAL" | "PAIR" | "GROUP");
                      setFormGroup("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INDIVIDUAL">Индивидуальное</SelectItem>
                      <SelectItem value="PAIR">Парное</SelectItem>
                      <SelectItem value="GROUP">Групповое</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formType === "INDIVIDUAL" && (
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
                            {s.studentNumber != null && ` #${s.studentNumber.toString().padStart(3, "0")}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formType === "PAIR" && (() => {
                  const pairs = groups.filter((g) => g.groupType === "PAIR");
                  return (
                    <div>
                      <label className="mb-1 block text-sm font-medium">Пара</label>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Select value={formGroup} onValueChange={setFormGroup}>
                            <SelectTrigger>
                              <SelectValue placeholder={pairs.length ? "Выберите пару" : "Пары ещё не созданы"} />
                            </SelectTrigger>
                            <SelectContent>
                              {pairs.map((g) => {
                                const label = g.displayName
                                  ?? g.members.map((m) => `${m.student.firstName} ${m.student.lastName}`).join(" + ");
                                return (
                                  <SelectItem key={g.id} value={g.id}>{label}</SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setNewPairStudent1("");
                            setNewPairStudent2("");
                            setNewPairError("");
                            setNewPairOpen(true);
                          }}
                        >
                          + Новая пара
                        </Button>
                      </div>
                    </div>
                  );
                })()}

                {formType === "GROUP" && (
                  <div>
                    <label className="mb-1 block text-sm font-medium">Группа</label>
                    <Select value={formGroup} onValueChange={setFormGroup}>
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите группу" />
                      </SelectTrigger>
                      <SelectContent>
                        {groups
                          .filter((g) => g.groupType !== "PAIR")
                          .map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.name ?? "—"} ({g.members?.length || 0} уч.)
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Тип услуги (опционально) */}
                {services.length > 0 && (
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Тип услуги <span className="text-xs text-muted-foreground">(влияет на цену)</span>
                    </label>
                    <Select value={formServiceTypeId || "__auto__"} onValueChange={(v) => setFormServiceTypeId(v === "__auto__" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__auto__">Авто (по типу занятия)</SelectItem>
                        {services
                          .filter((s) => {
                            if (formType === "INDIVIDUAL") return s.kind === "INDIVIDUAL";
                            if (formType === "PAIR") return s.kind === "PAIR";
                            return s.kind === "GROUP";
                          })
                          .sort((a, b) => a.sortOrder - b.sortOrder)
                          .map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
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

      {/* Диалог создания новой пары */}
      <Dialog open={newPairOpen} onOpenChange={setNewPairOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая пара</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Имя пары будет сгенерировано автоматически из ФИО учеников.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium">Первый ученик</label>
              <Select value={newPairStudent1} onValueChange={setNewPairStudent1}>
                <SelectTrigger><SelectValue placeholder="Выберите ученика" /></SelectTrigger>
                <SelectContent>
                  {students
                    .filter((s) => s.id !== newPairStudent2)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.lastName} {s.firstName}
                        {s.studentNumber != null && ` #${s.studentNumber.toString().padStart(3, "0")}`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Второй ученик</label>
              <Select value={newPairStudent2} onValueChange={setNewPairStudent2}>
                <SelectTrigger><SelectValue placeholder="Выберите ученика" /></SelectTrigger>
                <SelectContent>
                  {students
                    .filter((s) => s.id !== newPairStudent1)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.lastName} {s.firstName}
                        {s.studentNumber != null && ` #${s.studentNumber.toString().padStart(3, "0")}`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {newPairError && (
              <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-600">{newPairError}</div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNewPairOpen(false)} disabled={newPairSaving}>
                Отмена
              </Button>
              <Button
                disabled={newPairSaving || !newPairStudent1 || !newPairStudent2 || newPairStudent1 === newPairStudent2}
                onClick={async () => {
                  setNewPairError("");
                  setNewPairSaving(true);
                  try {
                    const res = await fetch("/api/groups", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        name: null,
                        groupType: "PAIR",
                        teacherId: selectedTeacherId,
                        studentIds: [newPairStudent1, newPairStudent2],
                      }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      setNewPairError(data?.error || "Не удалось создать пару");
                      return;
                    }
                    const created = await res.json();
                    // Обновим список групп и выберем созданную пару
                    const groupsRes = await fetch("/api/groups");
                    if (groupsRes.ok) setGroups(await groupsRes.json());
                    setFormGroup(created.id);
                    setNewPairOpen(false);
                  } finally {
                    setNewPairSaving(false);
                  }
                }}
              >
                {newPairSaving ? "Создание..." : "Создать"}
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
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
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
                Вставьте ссылку на Google Таблицу <em>или</em> загрузите файл .xlsx.
              </p>
              <input
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                value={importUrl}
                onChange={(e) => {
                  setImportUrl(e.target.value);
                  if (e.target.value) {
                    setImportSheets(null);
                    setImportWorkbookFile(null);
                  }
                }}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                disabled={!!importWorkbookFile}
              />
              <div className="relative">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-gray-200" />
                <div className="relative text-center">
                  <span className="bg-white px-2 text-xs text-gray-400">или</span>
                </div>
              </div>
              <div className="space-y-2">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-gray-200"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setImportUrl("");
                      handleSelectXlsxFile(f);
                    }
                  }}
                  disabled={importLoading}
                />
                {importWorkbookFile && importSheets && (
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">Выберите лист (страницу):</label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                      value={importSelectedSheet}
                      onChange={(e) => setImportSelectedSheet(e.target.value)}
                    >
                      {importSheets.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400">
                      Найдено листов: {importSheets.length}. Имя листа обычно = дата субботы или диапазон недели.
                    </p>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400">
                Импорт на неделю <strong>{formatWeekRange(weekStart)}</strong>
                {activeDayGroup === "sat" && <span> (суббота)</span>}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                  Отмена
                </Button>
                <Button
                  onClick={handleLoadPreview}
                  disabled={
                    importLoading ||
                    (!importUrl.trim() && !(importWorkbookFile && importSelectedSheet))
                  }
                >
                  {importLoading ? "Загрузка..." : "Загрузить превью"}
                </Button>
              </div>
            </div>
          )}

          {importStage === "preview" && importPreview && (
            <div className="space-y-4">
              {/* Сводка */}
              <div className="flex flex-wrap gap-2">
                {importPreview.detectedFormat === "v2-multiblock" ? (
                  <span className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-800">
                    Многоблочный · {importPreview.blocksDetected} бл. · {importPreview.teachersDetected.length} уч.
                  </span>
                ) : importPreview.detectedFormat === "v3-saturday" ? (
                  <span className="rounded bg-purple-100 px-2 py-1 text-xs text-purple-800">
                    Субботнее · {importPreview.teachersDetected.length} уч.
                  </span>
                ) : (
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs">Простой формат</span>
                )}
                <span className="rounded bg-gray-100 px-2 py-1 text-xs">
                  Всего: <strong>{importPreview.totalRows}</strong>
                </span>
                <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-800">
                  Авто: <strong>{importPreview.validRows}</strong>
                </span>
                {importPreview.errorRows > 0 && (
                  <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">
                    Нужно сопоставить: <strong>{importPreview.errorRows}</strong>
                  </span>
                )}
                {resolvedManuallyCount > 0 && (
                  <span className="rounded bg-yellow-100 px-2 py-1 text-xs text-yellow-800">
                    Вручную: <strong>{resolvedManuallyCount}</strong>
                  </span>
                )}
              </div>

              {importPreview.errorRows > 0 && (
                <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
                  Для строк с ошибками выберите кто это в колонке <strong>«Выбрать»</strong>. После импорта система запомнит сопоставления.
                </div>
              )}

              {/* Таблица превью */}
              <div className="max-h-[420px] overflow-auto rounded border">
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
                      <th className="border-b p-2 text-left">Результат / Выбрать</th>
                      <th className="border-b p-2 text-left">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.matches.map((m, i) => {
                      const mv2 = m as MatchedRowV2;
                      const r = resolutions.get(i);
                      const hasTeacherErr = m.errors.some((e) => e.startsWith("Учитель не найден"));
                      const hasStudentErr = m.errors.some(
                        (e) => e.startsWith("Не найден") || e.startsWith("Группа не найдена")
                      );
                      const isResolved =
                        m.errors.length === 0 ||
                        (r && (!hasTeacherErr || !!r.teacherId) && (!hasStudentErr || !!r.studentId || !!r.groupId));

                      return (
                        <tr
                          key={i}
                          className={
                            m.errors.length === 0
                              ? "bg-green-50"
                              : isResolved
                              ? "bg-yellow-50"
                              : "bg-red-50"
                          }
                        >
                          <td className="border-b p-2 whitespace-nowrap">{m.cell.time}</td>

                          {/* Учитель */}
                          <td className="border-b p-2">
                            {hasTeacherErr ? (
                              <div className="space-y-1">
                                <div className="text-red-500">{m.cell.teacherName}</div>
                                <Select
                                  value={r?.teacherId ?? ""}
                                  onValueChange={(tid) => {
                                    const t = teachers.find((t) => t.id === tid);
                                    if (!t) return;
                                    const sameTeacherName = m.cell.teacherName;
                                    setResolutions((prev) => {
                                      const next = new Map(prev);
                                      // Применяем ко ВСЕМ строкам с тем же именем учителя
                                      importPreview!.matches.forEach((match, idx) => {
                                        if (
                                          match.cell.teacherName === sameTeacherName &&
                                          match.errors.some((e) => e.startsWith("Учитель не найден"))
                                        ) {
                                          next.set(idx, {
                                            ...next.get(idx),
                                            teacherId: tid,
                                            teacherLabel: `${t.lastName} ${t.firstName}`,
                                          });
                                        }
                                      });
                                      return next;
                                    });
                                  }}
                                >
                                  <SelectTrigger className="h-6 w-40 text-xs">
                                    <SelectValue placeholder="Выбрать учителя" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {teachers.map((t) => (
                                      <SelectItem key={t.id} value={t.id}>
                                        {t.lastName} {t.firstName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : (
                              <span>{m.teacherLabel ?? m.cell.teacherName}</span>
                            )}
                          </td>

                          {/* Исходная ячейка */}
                          <td
                            className="border-b p-2 text-gray-500 max-w-[110px] truncate"
                            title={m.cell.cellValue}
                          >
                            {m.cell.cellValue}
                          </td>

                          {/* Дни + Каб (только v2) */}
                          {importPreview.detectedFormat === "v2-multiblock" && (
                            <>
                              <td className="border-b p-2 text-gray-500 whitespace-nowrap">
                                {mv2.dayGroup === "mwf" ? "Пн/Ср/Пт" : "Вт/Чт"}
                              </td>
                              <td className="border-b p-2 text-gray-400">{mv2.room || "—"}</td>
                            </>
                          )}

                          {/* Результат / Выбрать */}
                          <td className="border-b p-2">
                            {m.errors.length === 0 ? (
                              <span>
                                {m.studentOrGroupLabel || "—"}
                                {m.lessonCategory && (
                                  <span className="ml-1 text-gray-400">{m.lessonCategory}</span>
                                )}
                              </span>
                            ) : hasStudentErr ? (
                              r?.studentId || r?.groupId ? (
                                <span className="text-yellow-700">{r.entityLabel}</span>
                              ) : (
                                <Select
                                  onValueChange={(val) => {
                                    const sameCellValue = m.cell.cellValue;
                                    setResolutions((prev) => {
                                      const next = new Map(prev);
                                      // Применяем ко ВСЕМ строкам с той же ячейкой
                                      importPreview!.matches.forEach((match, idx) => {
                                        if (
                                          match.cell.cellValue === sameCellValue &&
                                          match.errors.some(
                                            (e) =>
                                              e.startsWith("Не найден") ||
                                              e.startsWith("Группа не найдена")
                                          )
                                        ) {
                                          const existing = next.get(idx) ?? {};
                                          if (val.startsWith("s:")) {
                                            const sid = val.slice(2);
                                            const s = students.find((s) => s.id === sid);
                                            next.set(idx, {
                                              ...existing,
                                              studentId: sid,
                                              groupId: null,
                                              entityLabel: s
                                                ? `${s.lastName} ${s.firstName}${s.studentNumber != null ? ` #${s.studentNumber.toString().padStart(3, "0")}` : ""}`
                                                : sid,
                                            });
                                          } else if (val.startsWith("g:")) {
                                            const gid = val.slice(2);
                                            const g = groups.find((g) => g.id === gid);
                                            next.set(idx, {
                                              ...existing,
                                              groupId: gid,
                                              studentId: null,
                                              entityLabel: g ? `гр ${g.name}` : gid,
                                            });
                                          }
                                        }
                                      });
                                      return next;
                                    });
                                  }}
                                >
                                  <SelectTrigger className="h-6 w-44 text-xs">
                                    <SelectValue placeholder="Кто это? ▾" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="_" disabled>
                                      — Группы —
                                    </SelectItem>
                                    {groups.map((g) => (
                                      <SelectItem key={g.id} value={`g:${g.id}`}>
                                        гр {g.name}
                                      </SelectItem>
                                    ))}
                                    <SelectItem value="_2" disabled>
                                      — Ученики —
                                    </SelectItem>
                                    {students.map((s) => (
                                      <SelectItem key={s.id} value={`s:${s.id}`}>
                                        {s.lastName} {s.firstName}
                                        {s.studentNumber != null && ` #${s.studentNumber.toString().padStart(3, "0")}`}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>

                          {/* Статус */}
                          <td className="border-b p-2 whitespace-nowrap">
                            {m.errors.length === 0 ? (
                              <span className="text-green-600">✓ OK</span>
                            ) : isResolved ? (
                              <span className="text-yellow-600">✎ Вручную</span>
                            ) : (
                              <span className="text-red-500" title={m.errors.join("\n")}>
                                ✗ Не найден
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Будет импортировано: <strong>{totalToImport}</strong> занятий
                  {resolvedManuallyCount > 0 && (
                    <span className="text-yellow-700"> (включая {resolvedManuallyCount} вручную)</span>
                  )}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setImportStage("input");
                      setImportPreview(null);
                      setImportError("");
                      setResolutions(new Map());
                    }}
                  >
                    Назад
                  </Button>
                  <Button
                    onClick={handleConfirmImport}
                    disabled={totalToImport === 0 || importLoading}
                  >
                    {importLoading ? "Импорт..." : `Импортировать ${totalToImport} занятий`}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Диалог сохранения псевдонимов */}
      <Dialog open={saveAliasesOpen} onOpenChange={setSaveAliasesOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Сохранить сопоставления?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            При следующем импорте эти имена будут распознаны автоматически:
          </p>
          <div className="max-h-48 overflow-auto rounded border p-2 text-xs space-y-1">
            {pendingAliases.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="rounded bg-gray-100 px-1 font-mono">{a.alias}</span>
                <span className="text-gray-400">→</span>
                <span className="font-medium">{a.label}</span>
                <span className="text-gray-400">({a.type})</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSaveAliasesOpen(false);
                setPendingAliases([]);
              }}
            >
              Не сохранять
            </Button>
            <Button onClick={handleSaveAliases}>
              Сохранить ({pendingAliases.length})
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Диалог продления */}
      <Dialog open={extendDialogOpen} onOpenChange={setExtendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Продлить расписание</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Скопировать расписание с текущей недели ({formatWeekRange(weekStart)}) на следующие недели.
              Недели с существующим расписанием будут пропущены.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium">Количество недель</label>
              <select
                className="w-full rounded border px-3 py-2"
                value={extendWeeks}
                onChange={(e) => setExtendWeeks(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((w) => (
                  <option key={w} value={w}>{w} {w === 1 ? "неделя" : w < 5 ? "недели" : "недель"}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setExtendDialogOpen(false)}>Отмена</Button>
              <Button onClick={handleExtend}>Продлить</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Диалог заморозки */}
      <Dialog open={freezeDialogOpen} onOpenChange={setFreezeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Заморозка расписания</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Все занятия в указанном периоде будут отменены. Используйте для каникул или перерывов.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium">Начало</label>
              <input
                type="date"
                className="w-full rounded border px-3 py-2"
                value={freezeStart}
                onChange={(e) => setFreezeStart(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Конец</label>
              <input
                type="date"
                className="w-full rounded border px-3 py-2"
                value={freezeEnd}
                onChange={(e) => setFreezeEnd(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Причина</label>
              <input
                type="text"
                className="w-full rounded border px-3 py-2"
                placeholder="Каникулы, перерыв и т.д."
                value={freezeReason}
                onChange={(e) => setFreezeReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFreezeDialogOpen(false)}>Отмена</Button>
              <Button onClick={handleFreeze}>Заморозить</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Диалог редактирования состава группового/парного занятия */}
      <Dialog open={attendeesDialogOpen} onOpenChange={setAttendeesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {attendeesSlot
                ? `Состав занятия — ${attendeesSlot.teacher.lastName} ${attendeesSlot.teacher.firstName}, ${
                    DAYS_OF_WEEK.find((d) => d.value === attendeesSlot.dayOfWeek)?.full ?? ""
                  } ${attendeesSlot.startTime}`
                : "Состав занятия"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {attendeesError && (
              <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-600">
                {attendeesError}
              </div>
            )}
            {attendeesSlot?.group?.members.length ? (
              <div className="space-y-2">
                {attendeesSlot.group.members.map((m) => {
                  const checked = attendeesSelected.has(m.student.id);
                  return (
                    <label
                      key={m.student.id}
                      className="flex cursor-pointer items-center gap-2 rounded border p-2 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={checked}
                        onChange={(e) => {
                          setAttendeesSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(m.student.id);
                            else next.delete(m.student.id);
                            return next;
                          });
                        }}
                      />
                      <span className="text-sm">
                        {m.student.lastName} {m.student.firstName}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">В группе нет учеников.</p>
            )}
            <p className="text-xs text-muted-foreground">
              Снятый чекбокс = ученик НЕ ходит на этот час этой недели. Сохранится только для этого слота.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setAttendeesDialogOpen(false)}
                disabled={attendeesSaving}
              >
                Отмена
              </Button>
              <Button onClick={handleSaveAttendees} disabled={attendeesSaving}>
                {attendeesSaving ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
