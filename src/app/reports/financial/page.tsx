"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface FinancialReport {
  month: string;
  summary: {
    totalRevenue: number;
    totalCharged: number;
    totalDebt: number;
    totalRecalc: number;
    activeStudents: number;
    paymentCount: number;
  };
  debts: { studentId: string; name: string; charged: number; paid: number; debt: number }[];
  teacherLoad: { name: string; hours: number }[];
}

export default function FinancialReportPage() {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [data, setData] = useState<FinancialReport | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/reports/financial?month=${month}`);
    if (res.ok) setData(await res.json());
  }, [month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const changeMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const monthNames = ["", "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const [y, m] = month.split("-").map(Number);
  const monthLabel = `${monthNames[m]} ${y}`;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Финансовый отчёт</h1>

      <div className="mb-6 flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => changeMonth(-1)}>←</Button>
        <span className="min-w-[150px] text-center font-medium">{monthLabel}</span>
        <Button variant="outline" size="sm" onClick={() => changeMonth(1)}>→</Button>
      </div>

      {!data ? (
        <div className="text-center text-gray-400">Загрузка...</div>
      ) : (
        <>
          {/* KPI */}
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-gray-500">Выручка</div>
                <div className="text-lg font-bold text-green-600">{data.summary.totalRevenue.toLocaleString()} ₸</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-gray-500">Начислено</div>
                <div className="text-lg font-bold">{data.summary.totalCharged.toLocaleString()} ₸</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-gray-500">Долг</div>
                <div className="text-lg font-bold text-red-600">{data.summary.totalDebt.toLocaleString()} ₸</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-gray-500">Перерасчёт</div>
                <div className="text-lg font-bold">{data.summary.totalRecalc.toLocaleString()} ₸</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-gray-500">Оплат</div>
                <div className="text-lg font-bold">{data.summary.paymentCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-gray-500">Активных детей</div>
                <div className="text-lg font-bold">{data.summary.activeStudents}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Должники */}
            <Card>
              <CardHeader><CardTitle className="text-base">Должники</CardTitle></CardHeader>
              <CardContent>
                {data.debts.length === 0 ? (
                  <div className="text-sm text-gray-400">Нет должников</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ученик</TableHead>
                        <TableHead className="text-right">Начислено</TableHead>
                        <TableHead className="text-right">Оплачено</TableHead>
                        <TableHead className="text-right">Долг</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.debts.map((d) => (
                        <TableRow key={d.studentId}>
                          <TableCell>
                            <a href={`/students/${d.studentId}`} className="text-blue-600 hover:underline">{d.name}</a>
                          </TableCell>
                          <TableCell className="text-right">{d.charged.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-green-600">{d.paid.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-bold text-red-600">{d.debt.toLocaleString()} ₸</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Нагрузка педагогов */}
            <Card>
              <CardHeader><CardTitle className="text-base">Нагрузка педагогов (часы)</CardTitle></CardHeader>
              <CardContent>
                {data.teacherLoad.length === 0 ? (
                  <div className="text-sm text-gray-400">Нет данных</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Педагог</TableHead>
                        <TableHead className="text-right">Часов</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.teacherLoad.map((t, i) => (
                        <TableRow key={i}>
                          <TableCell>{t.name}</TableCell>
                          <TableCell className="text-right font-medium">{t.hours}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
