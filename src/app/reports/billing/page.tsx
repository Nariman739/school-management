"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
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
  serviceName: string | null;
  price: number;
  status: string;
}

interface ServiceBreakdown {
  serviceTypeId: string | null;
  serviceName: string;
  hours: number;
  amount: number;
}

interface BillingEntry {
  studentId: string;
  studentNumber: number | null;
  studentName: string;
  parentName: string;
  parentPhone: string;
  hourlyRate: number;
  totalHours: number;
  totalAmount: number;
  byService: ServiceBreakdown[];
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            window.open(`/api/reports/billing/export?weekStart=${weekStart}`, "_blank");
          }}
        >
          📥 Excel
        </Button>
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
              <TableHead className="w-12">№</TableHead>
              <TableHead>Ученик</TableHead>
              <TableHead>Родитель</TableHead>
              <TableHead>Телефон</TableHead>
              <TableHead className="text-right">Часы</TableHead>
              <TableHead>Разбивка по услугам</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((entry) => (
              <Fragment key={entry.studentId}>
                <TableRow
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() =>
                    setExpandedStudent(
                      expandedStudent === entry.studentId ? null : entry.studentId,
                    )
                  }
                >
                  <TableCell className="text-muted-foreground font-mono">
                    {entry.studentNumber ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium">{entry.studentName}</TableCell>
                  <TableCell>{entry.parentName}</TableCell>
                  <TableCell>{entry.parentPhone}</TableCell>
                  <TableCell className="text-right">{entry.totalHours}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {entry.byService.map((b) => (
                        <span
                          key={(b.serviceTypeId ?? "legacy") + b.serviceName}
                          className="rounded bg-gray-100 px-2 py-0.5 text-xs"
                          title={`${b.hours} ч × ${(b.amount / Math.max(b.hours, 1)).toLocaleString()} ₸`}
                        >
                          {b.serviceName}: <strong>{b.hours} ч</strong> ({b.amount.toLocaleString()} ₸)
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {entry.totalAmount.toLocaleString()} ₸
                  </TableCell>
                  <TableCell>
                    {expandedStudent === entry.studentId ? "▲" : "▼"}
                  </TableCell>
                </TableRow>
                {expandedStudent === entry.studentId && (
                  <TableRow>
                    <TableCell colSpan={8}>
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
                                <TableHead>Услуга</TableHead>
                                <TableHead className="text-right">Цена</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {entry.details
                                .sort(
                                  (a, b) =>
                                    a.day - b.day || a.time.localeCompare(b.time),
                                )
                                .map((d, i) => (
                                  <TableRow key={i}>
                                    <TableCell>
                                      {
                                        DAYS_OF_WEEK.find((dw) => dw.value === d.day)
                                          ?.full
                                      }
                                    </TableCell>
                                    <TableCell>{d.time}</TableCell>
                                    <TableCell>{d.teacherName}</TableCell>
                                    <TableCell>
                                      {d.serviceName ??
                                        (d.type === "INDIVIDUAL"
                                          ? "Индивидуальное"
                                          : "Групповое")}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {d.price.toLocaleString()} ₸
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
              </Fragment>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
