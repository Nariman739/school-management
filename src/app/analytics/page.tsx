"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Analytics {
  kpi: {
    activeStudents: number;
    activeTeachers: number;
    totalGroups: number;
    attendancePct: number;
    totalRevenue: number;
    avgCheck: number;
    totalLessons: number;
    attendedLessons: number;
  };
  revenueByMonth: { month: string; revenue: number; payments: number }[];
  attendanceByMonth: { month: string; attended: number; absent: number; sick: number; total: number; pct: number }[];
  teacherLoad: { name: string; hours: number }[];
  churnRisk: { id: string; name: string; streak: number }[];
}

const MONTH_NAMES: Record<string, string> = {
  "01": "Янв", "02": "Фев", "03": "Мар", "04": "Апр", "05": "Май", "06": "Июн",
  "07": "Июл", "08": "Авг", "09": "Сен", "10": "Окт", "11": "Ноя", "12": "Дек",
};

function formatMonth(m: string) {
  const [, month] = m.split("-");
  return MONTH_NAMES[month] || m;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/analytics?months=6");
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!data) return <div className="py-12 text-center text-gray-400">Загрузка...</div>;

  const { kpi } = data;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Аналитика</h1>

      {/* KPI */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-gray-500">Активных детей</div>
            <div className="text-2xl font-bold">{kpi.activeStudents}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-gray-500">Педагогов</div>
            <div className="text-2xl font-bold">{kpi.activeTeachers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-gray-500">Посещаемость</div>
            <div className={`text-2xl font-bold ${kpi.attendancePct >= 80 ? "text-green-600" : kpi.attendancePct >= 60 ? "text-yellow-600" : "text-red-600"}`}>
              {kpi.attendancePct}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-gray-500">Выручка (период)</div>
            <div className="text-2xl font-bold text-green-600">{kpi.totalRevenue.toLocaleString()} ₸</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-gray-500">Средний чек</div>
            <div className="text-2xl font-bold">{kpi.avgCheck.toLocaleString()} ₸</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-gray-500">Групп</div>
            <div className="text-2xl font-bold">{kpi.totalGroups}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-gray-500">Проведено уроков</div>
            <div className="text-2xl font-bold">{kpi.attendedLessons}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-gray-500">Всего записей</div>
            <div className="text-2xl font-bold">{kpi.totalLessons}</div>
          </CardContent>
        </Card>
      </div>

      {/* Графики */}
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        {/* Выручка */}
        <Card>
          <CardHeader><CardTitle className="text-base">Выручка по месяцам</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.revenueByMonth.map((d) => ({ ...d, label: formatMonth(d.month) }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any) => `${Number(v).toLocaleString()} ₸`} />
                <Bar dataKey="revenue" fill="#10b981" name="Выручка" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Посещаемость */}
        <Card>
          <CardHeader><CardTitle className="text-base">Посещаемость по месяцам</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.attendanceByMonth.map((d) => ({ ...d, label: formatMonth(d.month) }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any) => `${v}%`} />
                <Legend />
                <Line type="monotone" dataKey="pct" stroke="#3b82f6" strokeWidth={2} name="Посещаемость %" dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Посещаемость стек */}
        <Card>
          <CardHeader><CardTitle className="text-base">Детализация посещаемости</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.attendanceByMonth.map((d) => ({ ...d, label: formatMonth(d.month) }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="attended" stackId="a" fill="#10b981" name="Присутствовал" />
                <Bar dataKey="absent" stackId="a" fill="#ef4444" name="Отсутствовал" />
                <Bar dataKey="sick" stackId="a" fill="#3b82f6" name="Больничный" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Нагрузка педагогов */}
        <Card>
          <CardHeader><CardTitle className="text-base">Нагрузка педагогов (текущий месяц)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.teacherLoad} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
                <Tooltip // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any) => `${v} ч`} />
                <Bar dataKey="hours" fill="#8b5cf6" name="Часов" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Дети с риском оттока */}
      {data.churnRisk.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Риск оттока (3+ пропуска подряд)
              <Badge className="ml-2 bg-red-100 text-red-800">{data.churnRisk.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ученик</TableHead>
                  <TableHead className="text-right">Пропуски подряд</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.churnRisk.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <a href={`/students/${s.id}`} className="text-blue-600 hover:underline">{s.name}</a>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge className={s.streak >= 5 ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}>
                        {s.streak} подряд
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
