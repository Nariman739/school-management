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

interface BillingDetail {
  day: number;
  time: string;
  teacherName: string;
  type: string;
}

interface BillingEntry {
  studentId: string;
  studentName: string;
  parentName: string;
  parentPhone: string;
  hourlyRate: number;
  totalHours: number;
  totalAmount: number;
  details: BillingDetail[];
}

export default function BillingReportPage() {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [data, setData] = useState<BillingEntry[]>([]);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/reports/billing?weekStart=${weekStart}`);
    if (res.ok) {
      setData(await res.json());
    }
  }, [weekStart]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const grandTotal = data.reduce((acc, d) => acc + d.totalAmount, 0);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Счёт родителям</h1>

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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ученик</TableHead>
              <TableHead>Родитель</TableHead>
              <TableHead>Телефон</TableHead>
              <TableHead className="text-right">Часы</TableHead>
              <TableHead className="text-right">Ставка</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((entry) => (
              <>
                <TableRow
                  key={entry.studentId}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() =>
                    setExpandedStudent(
                      expandedStudent === entry.studentId
                        ? null
                        : entry.studentId
                    )
                  }
                >
                  <TableCell className="font-medium">
                    {entry.studentName}
                  </TableCell>
                  <TableCell>{entry.parentName}</TableCell>
                  <TableCell>{entry.parentPhone}</TableCell>
                  <TableCell className="text-right">
                    {entry.totalHours}
                  </TableCell>
                  <TableCell className="text-right">
                    {entry.hourlyRate.toLocaleString()} ₸
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {entry.totalAmount.toLocaleString()} ₸
                  </TableCell>
                  <TableCell>
                    {expandedStudent === entry.studentId ? "▲" : "▼"}
                  </TableCell>
                </TableRow>
                {expandedStudent === entry.studentId && (
                  <TableRow key={`${entry.studentId}-details`}>
                    <TableCell colSpan={7}>
                      <Card className="m-2">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">
                            Детализация за неделю
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>День</TableHead>
                                <TableHead>Время</TableHead>
                                <TableHead>Учитель</TableHead>
                                <TableHead>Тип</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {entry.details
                                .sort(
                                  (a, b) =>
                                    a.day - b.day ||
                                    a.time.localeCompare(b.time)
                                )
                                .map((d, i) => (
                                  <TableRow key={i}>
                                    <TableCell>
                                      {
                                        DAYS_OF_WEEK.find(
                                          (dw) => dw.value === d.day
                                        )?.full
                                      }
                                    </TableCell>
                                    <TableCell>{d.time}</TableCell>
                                    <TableCell>{d.teacherName}</TableCell>
                                    <TableCell>
                                      {d.type === "INDIVIDUAL"
                                        ? "Индивидуальное"
                                        : "Групповое"}
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
