"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getMonday, addWeeks, formatWeekRange } from "@/lib/schedule-utils";

interface SubstitutionEntry {
  id: string;
  date: string;
  time: string;
  originalTeacher: string;
  substituteTeacher: string;
  lessonType: string;
  description: string;
  lessonCategory: string | null;
}

const DAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

export default function SubstitutionsPage() {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [data, setData] = useState<SubstitutionEntry[]>([]);

  const fetchData = useCallback(async () => {
    const from = weekStart;
    const toDate = new Date(weekStart);
    toDate.setDate(toDate.getDate() + 6);
    const to = toDate.toISOString().split("T")[0];

    const res = await fetch(`/api/reports/substitutions?from=${from}&to=${to}`);
    if (res.ok) setData(await res.json());
  }, [weekStart]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Журнал замен</h1>

      <div className="mb-6 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addWeeks(weekStart, -1))}>
            ←
          </Button>
          <span className="min-w-[160px] text-center font-medium">
            {formatWeekRange(weekStart)}
          </span>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
            →
          </Button>
        </div>
        <div className="ml-auto text-sm text-gray-500">
          Замен за неделю: <strong>{data.length}</strong>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          Замен за эту неделю не было
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата</TableHead>
              <TableHead>Время</TableHead>
              <TableHead>Основной педагог</TableHead>
              <TableHead>Заменяющий</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Описание</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((entry) => {
              const d = new Date(entry.date);
              const dayName = DAYS[d.getDay()];
              return (
                <TableRow key={entry.id}>
                  <TableCell>
                    {dayName}, {entry.date}
                  </TableCell>
                  <TableCell>{entry.time}</TableCell>
                  <TableCell>{entry.originalTeacher}</TableCell>
                  <TableCell className="font-medium text-purple-700">
                    {entry.substituteTeacher}
                  </TableCell>
                  <TableCell>
                    {entry.lessonType === "INDIVIDUAL" ? "Инд." : "Груп."}
                    {entry.lessonCategory && ` (${entry.lessonCategory})`}
                  </TableCell>
                  <TableCell>{entry.description}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
