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
  DAYS_OF_WEEK,
  TIME_SLOTS,
  getMonday,
  addWeeks,
  formatWeekRange,
  getEndTime,
} from "@/lib/schedule-utils";

interface Teacher {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string | null;
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
  teacher: Teacher;
  student: Student | null;
  group: (Group & { members: GroupMember[] }) | null;
}

export default function SchedulePage() {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [selectedTeacher, setSelectedTeacher] = useState<string>("all");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(1);
  const [selectedTime, setSelectedTime] = useState("09:00");
  const [formTeacher, setFormTeacher] = useState("");
  const [formType, setFormType] = useState<"INDIVIDUAL" | "GROUP">("INDIVIDUAL");
  const [formStudent, setFormStudent] = useState("");
  const [formGroup, setFormGroup] = useState("");
  const [error, setError] = useState("");
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);

  const fetchSlots = useCallback(async () => {
    const params = new URLSearchParams({ weekStart });
    if (selectedTeacher !== "all") {
      params.set("teacherId", selectedTeacher);
    }
    const res = await fetch(`/api/schedule?${params}`);
    if (res.ok) {
      setSlots(await res.json());
    }
  }, [weekStart, selectedTeacher]);

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

  const openAddDialog = (day: number, time: string) => {
    setSelectedDay(day);
    setSelectedTime(time);
    setFormTeacher(selectedTeacher !== "all" ? selectedTeacher : "");
    setFormType("INDIVIDUAL");
    setFormStudent("");
    setFormGroup("");
    setError("");
    setDialogOpen(true);
  };

  const handleAddSlot = async () => {
    setError("");
    const body: Record<string, unknown> = {
      teacherId: formTeacher,
      dayOfWeek: selectedDay,
      startTime: selectedTime,
      endTime: getEndTime(selectedTime),
      weekStartDate: weekStart,
      lessonType: formType,
    };

    if (formType === "INDIVIDUAL") {
      body.studentId = formStudent;
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
      setError(data.error || "Ошибка при создании");
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

  const getSlotForCell = (day: number, time: string): ScheduleSlot[] => {
    return slots.filter((s) => s.dayOfWeek === day && s.startTime === time);
  };

  const getSlotLabel = (slot: ScheduleSlot): string => {
    if (slot.lessonType === "INDIVIDUAL" && slot.student) {
      return `${slot.student.lastName} ${slot.student.firstName[0]}.`;
    }
    if (slot.lessonType === "GROUP" && slot.group) {
      return `гр. ${slot.group.name}`;
    }
    return "—";
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Расписание</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCopyDialogOpen(true)}>
            Копировать с пред. недели
          </Button>
        </div>
      </div>

      {/* Фильтры */}
      <div className="mb-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart(addWeeks(weekStart, -1))}
          >
            ←
          </Button>
          <span className="min-w-[160px] text-center font-medium">
            {formatWeekRange(weekStart)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart(addWeeks(weekStart, 1))}
          >
            →
          </Button>
        </div>

        <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Все учителя" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все учителя</SelectItem>
            {teachers.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.lastName} {t.firstName} {t.patronymic || ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Сетка расписания */}
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="border-b border-r bg-gray-50 p-2 text-left text-sm font-medium text-gray-500">
                Время
              </th>
              {DAYS_OF_WEEK.slice(0, 7).map((day) => (
                <th
                  key={day.value}
                  className="border-b border-r bg-gray-50 p-2 text-center text-sm font-medium text-gray-500"
                >
                  {day.full}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map((time) => (
              <tr key={time}>
                <td className="border-b border-r p-2 text-sm font-medium text-gray-500">
                  {time}
                </td>
                {DAYS_OF_WEEK.slice(0, 7).map((day) => {
                  const cellSlots = getSlotForCell(day.value, time);
                  return (
                    <td
                      key={day.value}
                      className="border-b border-r p-1 align-top"
                      style={{ minWidth: 120, minHeight: 50 }}
                    >
                      {cellSlots.map((slot) => (
                        <div
                          key={slot.id}
                          className={`mb-1 cursor-pointer rounded px-2 py-1 text-xs ${
                            slot.lessonType === "INDIVIDUAL"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-green-100 text-green-800"
                          }`}
                          onClick={() => handleDeleteSlot(slot.id)}
                          title="Нажмите, чтобы удалить"
                        >
                          <div className="font-medium">{getSlotLabel(slot)}</div>
                          {selectedTeacher === "all" && (
                            <div className="text-[10px] opacity-70">
                              {slot.teacher.lastName}
                            </div>
                          )}
                        </div>
                      ))}
                      {cellSlots.length === 0 && (
                        <button
                          className="flex h-10 w-full items-center justify-center rounded border border-dashed border-gray-200 text-gray-300 hover:border-gray-400 hover:text-gray-500"
                          onClick={() => openAddDialog(day.value, time)}
                        >
                          +
                        </button>
                      )}
                      {cellSlots.length > 0 && (
                        <button
                          className="mt-1 flex w-full items-center justify-center rounded text-xs text-gray-300 hover:text-gray-500"
                          onClick={() => openAddDialog(day.value, time)}
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

      {/* Легенда */}
      <div className="mt-4 flex items-center gap-4">
        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
          Индивидуальное
        </Badge>
        <Badge variant="secondary" className="bg-green-100 text-green-800">
          Групповое
        </Badge>
      </div>

      {/* Диалог добавления слота */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Добавить занятие —{" "}
              {DAYS_OF_WEEK.find((d) => d.value === selectedDay)?.full},{" "}
              {selectedTime}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {error && (
              <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">Учитель</label>
              <Select value={formTeacher} onValueChange={setFormTeacher}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите учителя" />
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

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Отмена
              </Button>
              <Button onClick={handleAddSlot} disabled={!formTeacher}>
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
    </div>
  );
}
