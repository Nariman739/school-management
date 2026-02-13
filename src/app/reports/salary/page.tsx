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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DAYS_OF_WEEK, getMonday, addWeeks, formatWeekRange } from "@/lib/schedule-utils";

interface SalaryDetail {
  day: number;
  time: string;
  type: string;
  description: string;
  hours: number;
  rate: number;
  sum: number;
}

interface SalaryEntry {
  teacherId: string;
  teacherName: string;
  individualHours: number;
  groupHours: number;
  individualRate: number;
  groupRate: number;
  individualTotal: number;
  groupTotal: number;
  total: number;
  details: SalaryDetail[];
}

export default function SalaryReportPage() {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [data, setData] = useState<SalaryEntry[]>([]);
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/reports/salary?weekStart=${weekStart}`);
    if (res.ok) {
      setData(await res.json());
    }
  }, [weekStart]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const grandTotal = data.reduce((acc, d) => acc + d.total, 0);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Зарплата учителям</h1>

      {/* Выбор недели */}
      <div className="mb-6 flex items-center gap-4">
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
        <div className="ml-auto text-lg font-bold">
          Итого: {grandTotal.toLocaleString()} ₸
        </div>
      </div>

      {data.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          Нет данных за эту неделю. Убедитесь, что проставлена посещаемость.
        </div>
      ) : (
        <div className="space-y-4">
          {data.map((entry) => (
            <Card key={entry.teacherId}>
              <CardHeader
                className="cursor-pointer"
                onClick={() =>
                  setExpandedTeacher(
                    expandedTeacher === entry.teacherId
                      ? null
                      : entry.teacherId
                  )
                }
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {entry.teacherName}
                  </CardTitle>
                  <div className="flex items-center gap-6 text-sm">
                    <span className="text-blue-600">
                      Инд: {entry.individualHours}ч × {entry.individualRate.toLocaleString()} ₸ ={" "}
                      {entry.individualTotal.toLocaleString()} ₸
                    </span>
                    <span className="text-green-600">
                      Груп: {entry.groupHours}ч × {entry.groupRate.toLocaleString()} ₸ ={" "}
                      {entry.groupTotal.toLocaleString()} ₸
                    </span>
                    <span className="text-lg font-bold">
                      {entry.total.toLocaleString()} ₸
                    </span>
                  </div>
                </div>
              </CardHeader>
              {expandedTeacher === entry.teacherId && (
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>День</TableHead>
                        <TableHead>Время</TableHead>
                        <TableHead>Тип</TableHead>
                        <TableHead>Описание</TableHead>
                        <TableHead className="text-right">Часы</TableHead>
                        <TableHead className="text-right">Ставка</TableHead>
                        <TableHead className="text-right">Сумма</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entry.details
                        .sort((a, b) => a.day - b.day || a.time.localeCompare(b.time))
                        .map((d, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              {DAYS_OF_WEEK.find((dw) => dw.value === d.day)?.label}
                            </TableCell>
                            <TableCell>{d.time}</TableCell>
                            <TableCell>
                              {d.type === "INDIVIDUAL" ? "Инд." : "Груп."}
                            </TableCell>
                            <TableCell>{d.description}</TableCell>
                            <TableCell className="text-right">{d.hours}</TableCell>
                            <TableCell className="text-right">
                              {d.rate.toLocaleString()} ₸
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {d.sum.toLocaleString()} ₸
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
