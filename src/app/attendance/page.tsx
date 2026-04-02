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
  ATTENDED: { label: "Урок состоялся", short: "Был", color: "text-green-700", bg: "bg-green-100 hover:bg-green-200" },
  SICK: { label: "Больничный", short: "Больничный", color: "text-yellow-700", bg: "bg-yellow-100 hover:bg-yellow-200" },
  LATE: { label: "Опоздание", short: "Опоздал", color: "text-orange-700", bg: "bg-orange-100 hover:bg-orange-200" },
  ABSENT: { label: "Не был", short: "Не был", color: "text-red-700", bg: "bg-red-100 hover:bg-red-200" },
};

const STATUS_ORDER: AttendanceStatus[] = ["ATTENDED", "LATE", "SICK", "ABSENT"];

interface Teacher { id: string; lastName: string; firstName: string; }
interface AttendanceStudent {
  studentId: string; studentName: string; status: AttendanceStatus;
  isPresent: boolean; attendanceId: string | null; isBehavioral: boolean;
}
interface Substitution { substituteTeacherId: string | null; substituteTeacherName: string | null; }
interface Assistant { assistantTeacherId: string | null; assistantTeacherName: string | null; }
interface AttendanceSlot {
  slotId: string; startTime: string; endTime: string;
  teacherName: string; teacherId: string;
  lessonType: string; lessonCategory: string | null; groupName: string | null;
  students: AttendanceStudent[];
  substitution: Substitution | null;
  assistant: Assistant | null;
}
interface MethodistEntry {
  teacherId: string; teacherName: string; weeklyRate: number;
  completed: boolean | null; checkId: string | null;
}

export default function AttendancePage() {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [selectedTeacher, setSelectedTeacher] = useState<string>("all");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [attendanceData, setAttendanceData] = useState<AttendanceSlot[]>([]);
  const [methodists, setMethodists] = useState<MethodistEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Диалоги
  const [dialogType, setDialogType] = useState<"sub" | "assist" | null>(null);
  const [dialogSlotId, setDialogSlotId] = useState("");
  const [dialogTeacherId, setDialogTeacherId] = useState("");

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ date });
    if (selectedTeacher !== "all") params.set("teacherId", selectedTeacher);

    const [attRes, methRes] = await Promise.all([
      fetch(`/api/attendance?${params}`),
      fetch(`/api/methodist?date=${date}`),
    ]);

    if (attRes.ok) setAttendanceData(await attRes.json());
    if (methRes.ok) setMethodists(await methRes.json());
    setLoading(false);
  }, [date, selectedTeacher]);

  useEffect(() => {
    fetch("/api/teachers").then((r) => r.json()).then(setTeachers);
  }, []);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  // Циклическое переключение статуса
  const cycleStatus = async (slotId: string, studentId: string, currentStatus: AttendanceStatus) => {
    const nextStatus = STATUS_ORDER[(STATUS_ORDER.indexOf(currentStatus) + 1) % STATUS_ORDER.length];
    const slot = attendanceData.find((s) => s.slotId === slotId);

    await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleSlotId: slotId, studentId, date, status: nextStatus,
        isSubstitution: !!slot?.substitution?.substituteTeacherId,
        substituteTeacherId: slot?.substitution?.substituteTeacherId || undefined,
        assistantTeacherId: slot?.assistant?.assistantTeacherId || undefined,
      }),
    });

    setAttendanceData((prev) =>
      prev.map((s) => s.slotId !== slotId ? s : {
        ...s,
        students: s.students.map((st) =>
          st.studentId === studentId
            ? { ...st, status: nextStatus, isPresent: nextStatus === "ATTENDED" }
            : st
        ),
      })
    );
  };

  // Диалог замены/ассистента
  const openDialog = (type: "sub" | "assist", slotId: string) => {
    setDialogType(type);
    setDialogSlotId(slotId);
    setDialogTeacherId("");
  };

  const confirmDialog = async () => {
    if (!dialogTeacherId) return;

    if (dialogType === "sub") {
      await fetch("/api/attendance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleSlotId: dialogSlotId, date, substituteTeacherId: dialogTeacherId }),
      });
    } else {
      await fetch("/api/attendance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleSlotId: dialogSlotId, date, assistantTeacherId: dialogTeacherId, action: "setAssistant" }),
      });
    }

    const teacher = teachers.find((t) => t.id === dialogTeacherId);
    const name = teacher ? `${teacher.lastName} ${teacher.firstName}` : null;

    setAttendanceData((prev) =>
      prev.map((s) => {
        if (s.slotId !== dialogSlotId) return s;
        if (dialogType === "sub") {
          return { ...s, substitution: { substituteTeacherId: dialogTeacherId, substituteTeacherName: name } };
        }
        return { ...s, assistant: { assistantTeacherId: dialogTeacherId, assistantTeacherName: name } };
      })
    );
    setDialogType(null);
  };

  const removeAssistant = async (slotId: string) => {
    await fetch("/api/attendance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleSlotId: slotId, date, action: "removeAssistant" }),
    });
    setAttendanceData((prev) =>
      prev.map((s) => s.slotId !== slotId ? s : { ...s, assistant: null })
    );
  };

  const removeSubstitution = async (slotId: string) => {
    const slot = attendanceData.find((s) => s.slotId === slotId);
    if (!slot) return;
    for (const student of slot.students) {
      await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleSlotId: slotId, studentId: student.studentId, date,
          status: student.status, isSubstitution: false, substituteTeacherId: null,
          assistantTeacherId: slot.assistant?.assistantTeacherId || null,
        }),
      });
    }
    setAttendanceData((prev) =>
      prev.map((s) => s.slotId !== slotId ? s : { ...s, substitution: null })
    );
  };

  // Методический час
  const toggleMethodist = async (teacherId: string, current: boolean | null) => {
    const completed = current === true ? false : true;
    await fetch("/api/methodist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId, date, completed }),
    });
    setMethodists((prev) =>
      prev.map((m) => m.teacherId === teacherId ? { ...m, completed } : m)
    );
  };

  const changeDate = (delta: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().split("T")[0]);
  };

  const dayName = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"][new Date(date).getDay()];

  const totalStudents = attendanceData.reduce((a, s) => a + s.students.length, 0);
  const attendedStudents = attendanceData.reduce((a, s) => a + s.students.filter((st) => st.status === "ATTENDED").length, 0);
  const sickStudents = attendanceData.reduce((a, s) => a + s.students.filter((st) => st.status === "SICK").length, 0);
  const lateStudents = attendanceData.reduce((a, s) => a + s.students.filter((st) => st.status === "LATE").length, 0);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Посещаемость</h1>

      {/* Фильтры */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => changeDate(-1)}>←</Button>
          <div className="text-center">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded border px-3 py-1.5 text-sm" />
            <div className="mt-1 text-xs text-gray-500">{dayName}</div>
          </div>
          <Button variant="outline" size="sm" onClick={() => changeDate(1)}>→</Button>
        </div>

        <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
          <SelectTrigger className="w-[250px]"><SelectValue placeholder="Все учителя" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все учителя</SelectItem>
            {teachers.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.lastName} {t.firstName}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-3 text-sm text-gray-500">
          <span>Был: <strong className="text-green-600">{attendedStudents}</strong></span>
          <span>Опоздал: <strong className="text-orange-600">{lateStudents}</strong></span>
          <span>Больничный: <strong className="text-yellow-600">{sickStudents}</strong></span>
          <span>Всего: {totalStudents}</span>
        </div>
      </div>

      {/* Легенда */}
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {STATUS_ORDER.map((s) => (
          <span key={s} className={`rounded-full px-3 py-1 ${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].color}`}>
            {STATUS_CONFIG[s].label}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-gray-400">Загрузка...</div>
      ) : (
        <>
          {/* Методический час */}
          {methodists.length > 0 && (
            <Card className="mb-4 border-indigo-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Методический час</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {methodists.map((m) => (
                    <div key={m.teacherId} className="flex items-center justify-between rounded-lg border px-4 py-2">
                      <div>
                        <span className="text-sm font-medium">{m.teacherName}</span>
                        <span className="ml-2 text-xs text-gray-400">{m.weeklyRate} ₸/нед</span>
                      </div>
                      <button
                        onClick={() => toggleMethodist(m.teacherId, m.completed)}
                        className={`rounded-full px-4 py-1 text-sm font-medium transition-colors ${
                          m.completed === true
                            ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                            : m.completed === false
                              ? "bg-red-100 text-red-700 hover:bg-red-200"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {m.completed === true ? "Состоялся" : m.completed === false ? "Не состоялся" : "Не отмечено"}
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Занятия */}
          {attendanceData.length === 0 ? (
            <div className="py-12 text-center text-gray-400">На этот день нет занятий</div>
          ) : (
            <div className="space-y-4">
              {attendanceData.map((slot) => (
                <Card key={slot.slotId}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        {slot.startTime} — {slot.endTime}{" "}
                        <span className="ml-2 text-gray-500">{slot.teacherName}</span>
                        {slot.lessonCategory && <span className="ml-2 text-xs text-gray-400">({slot.lessonCategory})</span>}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {/* Ассистент */}
                        {slot.assistant?.assistantTeacherName ? (
                          <Badge variant="secondary" className="cursor-pointer bg-indigo-100 text-indigo-800 hover:bg-indigo-200" onClick={() => removeAssistant(slot.slotId)}>
                            Ассистент: {slot.assistant.assistantTeacherName} ✕
                          </Badge>
                        ) : (
                          <Button variant="outline" size="sm" className="text-xs" onClick={() => openDialog("assist", slot.slotId)}>
                            Ассистент
                          </Button>
                        )}

                        {/* Замена */}
                        {slot.substitution?.substituteTeacherName ? (
                          <Badge variant="secondary" className="cursor-pointer bg-purple-100 text-purple-800 hover:bg-purple-200" onClick={() => removeSubstitution(slot.slotId)}>
                            Замена: {slot.substitution.substituteTeacherName} ✕
                          </Badge>
                        ) : (
                          <Button variant="outline" size="sm" className="text-xs" onClick={() => openDialog("sub", slot.slotId)}>
                            Замена
                          </Button>
                        )}

                        <Badge variant="secondary" className={slot.lessonType === "INDIVIDUAL" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"}>
                          {slot.lessonType === "INDIVIDUAL" ? "Индивидуальное" : `Группа: ${slot.groupName}`}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {slot.students.map((student) => {
                        const cfg = STATUS_CONFIG[student.status];
                        return (
                          <div key={student.studentId} className="flex items-center justify-between rounded-lg border px-4 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{student.studentName}</span>
                              {student.isBehavioral && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-500">ПВД</span>}
                            </div>
                            <button
                              onClick={() => cycleStatus(slot.slotId, student.studentId, student.status)}
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
        </>
      )}

      {/* Диалог замены / ассистента */}
      <Dialog open={dialogType !== null} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogType === "sub" ? "Замена педагога" : "Назначить ассистента"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              {dialogType === "sub"
                ? "Выберите педагога, который фактически провёл урок"
                : "Выберите педагога-ассистента на этом уроке"}
            </p>
            <Select value={dialogTeacherId} onValueChange={setDialogTeacherId}>
              <SelectTrigger><SelectValue placeholder="Выберите педагога" /></SelectTrigger>
              <SelectContent>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.lastName} {t.firstName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogType(null)}>Отмена</Button>
              <Button onClick={confirmDialog} disabled={!dialogTeacherId}>Подтвердить</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
