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

interface Teacher {
  id: string;
  lastName: string;
  firstName: string;
}

interface AttendanceStudent {
  studentId: string;
  studentName: string;
  isPresent: boolean;
  attendanceId: string | null;
}

interface AttendanceSlot {
  slotId: string;
  startTime: string;
  endTime: string;
  teacherName: string;
  teacherId: string;
  lessonType: string;
  groupName: string | null;
  students: AttendanceStudent[];
}

export default function AttendancePage() {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [selectedTeacher, setSelectedTeacher] = useState<string>("all");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [attendanceData, setAttendanceData] = useState<AttendanceSlot[]>([]);
  const [loading, setLoading] = useState(false);

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

  const toggleAttendance = async (
    slotId: string,
    studentId: string,
    currentValue: boolean
  ) => {
    await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleSlotId: slotId,
        studentId,
        date,
        isPresent: !currentValue,
      }),
    });

    // Обновляем локальное состояние
    setAttendanceData((prev) =>
      prev.map((slot) => {
        if (slot.slotId !== slotId) return slot;
        return {
          ...slot,
          students: slot.students.map((s) =>
            s.studentId === studentId ? { ...s, isPresent: !currentValue } : s
          ),
        };
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
  const presentStudents = attendanceData.reduce(
    (acc, slot) => acc + slot.students.filter((s) => s.isPresent).length,
    0
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Посещаемость</h1>

      {/* Фильтры */}
      <div className="mb-6 flex items-center gap-4">
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

        <div className="ml-auto text-sm text-gray-500">
          Присутствуют: <strong>{presentStudents}</strong> / {totalStudents}
        </div>
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
                  </CardTitle>
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
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {slot.students.map((student) => (
                    <div
                      key={student.studentId}
                      className="flex items-center justify-between rounded-lg border px-4 py-2"
                    >
                      <span className="text-sm">{student.studentName}</span>
                      <button
                        onClick={() =>
                          toggleAttendance(
                            slot.slotId,
                            student.studentId,
                            student.isPresent
                          )
                        }
                        className={`rounded-full px-4 py-1 text-sm font-medium transition-colors ${
                          student.isPresent
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-red-100 text-red-700 hover:bg-red-200"
                        }`}
                      >
                        {student.isPresent ? "Был" : "Не был"}
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
