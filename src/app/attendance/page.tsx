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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AttendanceStatus = "ATTENDED" | "SICK" | "LATE" | "ABSENT";

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; short: string; color: string; bg: string }
> = {
  ATTENDED: {
    label: "Урок состоялся",
    short: "Был",
    color: "text-green-700",
    bg: "bg-green-100 hover:bg-green-200",
  },
  SICK: {
    label: "Больничный",
    short: "Больничный",
    color: "text-yellow-700",
    bg: "bg-yellow-100 hover:bg-yellow-200",
  },
  LATE: {
    label: "Опоздание",
    short: "Опоздал",
    color: "text-orange-700",
    bg: "bg-orange-100 hover:bg-orange-200",
  },
  ABSENT: {
    label: "Не был",
    short: "Не был",
    color: "text-red-700",
    bg: "bg-red-100 hover:bg-red-200",
  },
};

const STATUS_ORDER: AttendanceStatus[] = ["ATTENDED", "LATE", "SICK", "ABSENT"];

interface Teacher {
  id: string;
  lastName: string;
  firstName: string;
}

interface AttendanceStudent {
  studentId: string;
  studentName: string;
  status: AttendanceStatus;
  isPresent: boolean;
  attendanceId: string | null;
  isBehavioral: boolean;
}

interface Substitution {
  substituteTeacherId: string | null;
  substituteTeacherName: string | null;
}

interface AttendanceSlot {
  slotId: string;
  startTime: string;
  endTime: string;
  teacherName: string;
  teacherId: string;
  lessonType: string;
  lessonCategory: string | null;
  groupName: string | null;
  students: AttendanceStudent[];
  substitution: Substitution | null;
}

export default function AttendancePage() {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [selectedTeacher, setSelectedTeacher] = useState<string>("all");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [attendanceData, setAttendanceData] = useState<AttendanceSlot[]>([]);
  const [loading, setLoading] = useState(false);

  // Замена педагога
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [subSlotId, setSubSlotId] = useState<string>("");
  const [subTeacherId, setSubTeacherId] = useState<string>("");

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ date });
    if (selectedTeacher !== "all") {
      params.set("teacherId", selectedTeacher);
    }
    const res = await fetch(`/api/attendance?${params}`);
    if (res.ok) {
      setAttendanceData(await res.json());
    }
    setLoading(false);
  }, [date, selectedTeacher]);

  useEffect(() => {
    fetch("/api/teachers")
      .then((r) => r.json())
      .then(setTeachers);
  }, []);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  // Циклическое переключение статуса
  const cycleStatus = async (
    slotId: string,
    studentId: string,
    currentStatus: AttendanceStatus
  ) => {
    const currentIdx = STATUS_ORDER.indexOf(currentStatus);
    const nextStatus = STATUS_ORDER[(currentIdx + 1) % STATUS_ORDER.length];

    // Находим слот чтобы проверить замену
    const slot = attendanceData.find((s) => s.slotId === slotId);
    const isSubstitution = slot?.substitution?.substituteTeacherId ? true : false;
    const substituteTeacherId = slot?.substitution?.substituteTeacherId || undefined;

    await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleSlotId: slotId,
        studentId,
        date,
        status: nextStatus,
        isSubstitution,
        substituteTeacherId,
      }),
    });

    // Обновляем локально
    setAttendanceData((prev) =>
      prev.map((slot) => {
        if (slot.slotId !== slotId) return slot;
        return {
          ...slot,
          students: slot.students.map((s) =>
            s.studentId === studentId
              ? { ...s, status: nextStatus, isPresent: nextStatus === "ATTENDED" }
              : s
          ),
        };
      })
    );
  };

  // Замена педагога
  const openSubDialog = (slotId: string) => {
    setSubSlotId(slotId);
    setSubTeacherId("");
    setSubDialogOpen(true);
  };

  const confirmSubstitution = async () => {
    if (!subTeacherId) return;

    await fetch("/api/attendance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleSlotId: subSlotId,
        date,
        substituteTeacherId: subTeacherId,
      }),
    });

    const teacher = teachers.find((t) => t.id === subTeacherId);

    setAttendanceData((prev) =>
      prev.map((slot) => {
        if (slot.slotId !== subSlotId) return slot;
        return {
          ...slot,
          substitution: {
            substituteTeacherId: subTeacherId,
            substituteTeacherName: teacher
              ? `${teacher.lastName} ${teacher.firstName}`
              : null,
          },
        };
      })
    );

    setSubDialogOpen(false);
  };

  const removeSubstitution = async (slotId: string) => {
    // Убираем замену — ставим substituteTeacherId = null через PATCH
    // Для простоты: обновляем каждую запись через POST заново
    const slot = attendanceData.find((s) => s.slotId === slotId);
    if (!slot) return;

    for (const student of slot.students) {
      await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleSlotId: slotId,
          studentId: student.studentId,
          date,
          status: student.status,
          isSubstitution: false,
          substituteTeacherId: null,
        }),
      });
    }

    setAttendanceData((prev) =>
      prev.map((s) => {
        if (s.slotId !== slotId) return s;
        return { ...s, substitution: null };
      })
    );
  };

  const changeDate = (delta: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().split("T")[0]);
  };

  const dayName = (() => {
    const days = [
      "Воскресенье",
      "Понедельник",
      "Вторник",
      "Среда",
      "Четверг",
      "Пятница",
      "Суббота",
    ];
    return days[new Date(date).getDay()];
  })();

  const totalStudents = attendanceData.reduce(
    (acc, slot) => acc + slot.students.length,
    0
  );
  const attendedStudents = attendanceData.reduce(
    (acc, slot) =>
      acc + slot.students.filter((s) => s.status === "ATTENDED").length,
    0
  );
  const sickStudents = attendanceData.reduce(
    (acc, slot) =>
      acc + slot.students.filter((s) => s.status === "SICK").length,
    0
  );
  const lateStudents = attendanceData.reduce(
    (acc, slot) =>
      acc + slot.students.filter((s) => s.status === "LATE").length,
    0
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Посещаемость</h1>

      {/* Фильтры */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => changeDate(-1)}>
            ←
          </Button>
          <div className="text-center">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border px-3 py-1.5 text-sm"
            />
            <div className="mt-1 text-xs text-gray-500">{dayName}</div>
          </div>
          <Button variant="outline" size="sm" onClick={() => changeDate(1)}>
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
                {t.lastName} {t.firstName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-3 text-sm text-gray-500">
          <span>
            Был: <strong className="text-green-600">{attendedStudents}</strong>
          </span>
          <span>
            Опоздал: <strong className="text-orange-600">{lateStudents}</strong>
          </span>
          <span>
            Больничный: <strong className="text-yellow-600">{sickStudents}</strong>
          </span>
          <span>Всего: {totalStudents}</span>
        </div>
      </div>

      {/* Легенда */}
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {STATUS_ORDER.map((s) => (
          <span
            key={s}
            className={`rounded-full px-3 py-1 ${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].color}`}
          >
            {STATUS_CONFIG[s].label}
          </span>
        ))}
      </div>

      {/* Карточки занятий */}
      {loading ? (
        <div className="text-center text-gray-400">Загрузка...</div>
      ) : attendanceData.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          На этот день нет занятий
        </div>
      ) : (
        <div className="space-y-4">
          {attendanceData.map((slot) => (
            <Card key={slot.slotId}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {slot.startTime} — {slot.endTime}{" "}
                    <span className="ml-2 text-gray-500">
                      {slot.teacherName}
                    </span>
                    {slot.lessonCategory && (
                      <span className="ml-2 text-xs text-gray-400">
                        ({slot.lessonCategory})
                      </span>
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {slot.substitution?.substituteTeacherName ? (
                      <Badge
                        variant="secondary"
                        className="cursor-pointer bg-purple-100 text-purple-800 hover:bg-purple-200"
                        onClick={() => removeSubstitution(slot.slotId)}
                      >
                        Замена: {slot.substitution.substituteTeacherName} ✕
                      </Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => openSubDialog(slot.slotId)}
                      >
                        Замена
                      </Button>
                    )}
                    <Badge
                      variant="secondary"
                      className={
                        slot.lessonType === "INDIVIDUAL"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-green-100 text-green-800"
                      }
                    >
                      {slot.lessonType === "INDIVIDUAL"
                        ? "Индивидуальное"
                        : `Группа: ${slot.groupName}`}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {slot.students.map((student) => {
                    const cfg = STATUS_CONFIG[student.status];
                    return (
                      <div
                        key={student.studentId}
                        className="flex items-center justify-between rounded-lg border px-4 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{student.studentName}</span>
                          {student.isBehavioral && (
                            <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-500">
                              ПВД
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() =>
                            cycleStatus(
                              slot.slotId,
                              student.studentId,
                              student.status
                            )
                          }
                          className={`rounded-full px-4 py-1 text-sm font-medium transition-colors ${cfg.bg} ${cfg.color}`}
                        >
                          {cfg.short}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Диалог замены педагога */}
      <Dialog open={subDialogOpen} onOpenChange={setSubDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Замена педагога</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Выберите педагога, который фактически провёл урок
            </p>
            <Select value={subTeacherId} onValueChange={setSubTeacherId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите педагога" />
              </SelectTrigger>
              <SelectContent>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.lastName} {t.firstName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSubDialogOpen(false)}>
                Отмена
              </Button>
              <Button onClick={confirmSubstitution} disabled={!subTeacherId}>
                Подтвердить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
