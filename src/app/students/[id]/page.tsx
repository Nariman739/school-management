"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/billing-rules";
import { getConsultationInfo, getConsultationBadge } from "@/lib/consultation";
import { DAYS_OF_WEEK, getMonday, addWeeks, formatWeekRange } from "@/lib/schedule-utils";

interface StudentScheduleSlot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  lessonType: string;
  lessonCategory: string | null;
  room: string | null;
  isCancelled: boolean;
  teacher: { id: string; fullName: string };
  group: { id: string; name: string | null } | null;
}

interface WeeklyBillingSlot {
  startTime: string;
  endTime: string;
  category: string | null;
  price: number;
  teacher: string;
  teacherFull: string;
}

interface WeeklyBillingGroup {
  dayGroup: string;
  label: string;
  daysCount: number;
  daysActive: number[];
  slots: WeeklyBillingSlot[];
  daySum: number;
  weekSum: number;
}

interface WeeklyBilling {
  weekStart: string;
  groups: WeeklyBillingGroup[];
  weeklyTotal: number;
}

interface StudentCard {
  student: {
    id: string;
    studentNumber: number | null;
    lastName: string;
    firstName: string;
    patronymic: string | null;
    parentName: string | null;
    parentPhone: string | null;
    hourlyRate: number;
    isBehavioral: boolean;
    tariffType: string;
    subscriptionRate: number | null;
    subscriptionLessons: number | null;
    enrollmentDate: string | null;
    notes: string | null;
    lastConsultationDate: string | null;
    consultationIntervalMonths: number | null;
    groupMembers: { group: { name: string; teacher: { lastName: string; firstName: string } } }[];
    studentFreezes: { id: string; startDate: string; endDate: string; reason: string; type: string }[];
    recalculations: { id: string; amount: number; reason: string; period: string; createdAt: string }[];
    tariffHistory: { id: string; hourlyRate: number; tariffType: string; effectiveFrom: string; effectiveTo: string | null }[];
    payments: { id: string; amount: number; date: string; note: string | null }[];
  };
  attendanceStats: { total: number; attended: number; absent: number; sick: number; validReason: number; transferred: number };
  recentAttendances: { date: string; time: string; status: string; teacher: string }[];
  balance: { month: string; charged: number; paid: number; recalculations: number; debt: number };
}

export default function StudentCardPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<StudentCard | null>(null);
  const [freezeDialog, setFreezeDialog] = useState(false);
  const [freezeForm, setFreezeForm] = useState({ startDate: "", endDate: "", reason: "", type: "OTHER" });
  const [recalcDialog, setRecalcDialog] = useState(false);
  const [recalcForm, setRecalcForm] = useState({ amount: "", reason: "", period: "" });
  const [tab, setTab] = useState<"info" | "attendance" | "schedule" | "billing" | "payments" | "freezes" | "crm">("info");
  const [interactions, setInteractions] = useState<{ id: string; type: string; date: string; note: string; promisedPayDate: string | null; promisedAmount: number | null }[]>([]);
  const [crmDialog, setCrmDialog] = useState(false);
  const [crmForm, setCrmForm] = useState({ type: "CALL", date: "", note: "", promisedPayDate: "", promisedAmount: "" });

  // Расписание ученика
  const [weekStart, setWeekStart] = useState<string>(() => getMonday(new Date()));
  const [scheduleSlots, setScheduleSlots] = useState<StudentScheduleSlot[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const fetchSchedule = useCallback(async () => {
    if (!id) return;
    setScheduleLoading(true);
    try {
      const res = await fetch(`/api/students/${id}/schedule?weekStart=${weekStart}`);
      if (res.ok) {
        const data = await res.json();
        setScheduleSlots(data.slots || []);
      }
    } finally {
      setScheduleLoading(false);
    }
  }, [id, weekStart]);

  // Часы и оплата (недельный биллинг)
  const [billingWeekStart, setBillingWeekStart] = useState<string>(() => getMonday(new Date()));
  const [billing, setBilling] = useState<WeeklyBilling | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);

  const fetchBilling = useCallback(async () => {
    if (!id) return;
    setBillingLoading(true);
    try {
      const res = await fetch(`/api/students/${id}/weekly-billing?weekStart=${billingWeekStart}`);
      if (res.ok) {
        setBilling(await res.json());
      }
    } finally {
      setBillingLoading(false);
    }
  }, [id, billingWeekStart]);

  // Консультации
  const [consultDialog, setConsultDialog] = useState(false);
  const [consultForm, setConsultForm] = useState({ date: "", intervalMonths: "" });

  const openConsultDialog = () => {
    if (!data) return;
    setConsultForm({
      date: data.student.lastConsultationDate ?? "",
      intervalMonths: data.student.consultationIntervalMonths?.toString() ?? "",
    });
    setConsultDialog(true);
  };

  const handleSaveConsult = async () => {
    if (!id) return;
    const s = data!.student;
    const res = await fetch(`/api/students/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lastName: s.lastName, firstName: s.firstName, patronymic: s.patronymic,
        parentName: s.parentName, parentPhone: s.parentPhone,
        hourlyRate: s.hourlyRate, tariffType: s.tariffType,
        subscriptionRate: s.subscriptionRate, subscriptionLessons: s.subscriptionLessons,
        enrollmentDate: s.enrollmentDate, notes: s.notes, isBehavioral: s.isBehavioral,
        lastConsultationDate: consultForm.date || null,
        consultationIntervalMonths: consultForm.intervalMonths ? Number(consultForm.intervalMonths) : null,
      }),
    });
    if (res.ok) {
      setConsultDialog(false);
      fetchCard();
    }
  };

  const handleMarkConsultDone = async () => {
    if (!id) return;
    const today = new Date().toISOString().slice(0, 10);
    const s = data!.student;
    const res = await fetch(`/api/students/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lastName: s.lastName, firstName: s.firstName, patronymic: s.patronymic,
        parentName: s.parentName, parentPhone: s.parentPhone,
        hourlyRate: s.hourlyRate, tariffType: s.tariffType,
        subscriptionRate: s.subscriptionRate, subscriptionLessons: s.subscriptionLessons,
        enrollmentDate: s.enrollmentDate, notes: s.notes, isBehavioral: s.isBehavioral,
        lastConsultationDate: today,
      }),
    });
    if (res.ok) fetchCard();
  };

  useEffect(() => {
    if (tab === "schedule") fetchSchedule();
  }, [tab, fetchSchedule]);

  useEffect(() => {
    if (tab === "billing") fetchBilling();
  }, [tab, fetchBilling]);

  const fetchCard = useCallback(async () => {
    const res = await fetch(`/api/students/${id}/card`);
    if (res.ok) setData(await res.json());
  }, [id]);

  const fetchInteractions = useCallback(async () => {
    const res = await fetch(`/api/students/${id}/interactions`);
    if (res.ok) setInteractions(await res.json());
  }, [id]);

  useEffect(() => { fetchCard(); fetchInteractions(); }, [fetchCard, fetchInteractions]);

  if (!data) return <div className="py-12 text-center text-gray-400">Загрузка...</div>;

  const { student, attendanceStats, recentAttendances, balance } = data;
  const attendPct = attendanceStats.total > 0 ? Math.round((attendanceStats.attended / attendanceStats.total) * 100) : 0;

  const handleFreeze = async () => {
    await fetch(`/api/students/${id}/freeze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(freezeForm),
    });
    setFreezeDialog(false);
    setFreezeForm({ startDate: "", endDate: "", reason: "", type: "OTHER" });
    fetchCard();
  };

  const handleRecalc = async () => {
    await fetch(`/api/students/${id}/recalculation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(recalcForm),
    });
    setRecalcDialog(false);
    setRecalcForm({ amount: "", reason: "", period: "" });
    fetchCard();
  };

  const handleCrm = async () => {
    await fetch(`/api/students/${id}/interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...crmForm,
        promisedAmount: crmForm.promisedAmount ? parseInt(crmForm.promisedAmount) : null,
        promisedPayDate: crmForm.promisedPayDate || null,
      }),
    });
    setCrmDialog(false);
    setCrmForm({ type: "CALL", date: "", note: "", promisedPayDate: "", promisedAmount: "" });
    fetchInteractions();
  };

  const deleteFreeze = async (freezeId: string) => {
    if (!confirm("Удалить заморозку?")) return;
    await fetch(`/api/students/${id}/freeze?freezeId=${freezeId}`, { method: "DELETE" });
    fetchCard();
  };

  return (
    <div>
      {/* Шапка */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {student.lastName} {student.firstName} {student.patronymic || ""}
            {student.studentNumber != null && (
              <span className="ml-3 text-xl font-mono text-gray-500">
                #{student.studentNumber.toString().padStart(3, "0")}
              </span>
            )}
          </h1>
          <div className="mt-1 flex gap-2 text-sm text-gray-500">
            {student.parentName && <span>Родитель: {student.parentName}</span>}
            {student.parentPhone && <span>| {student.parentPhone}</span>}
          </div>
          <div className="mt-1 flex gap-2">
            {student.groupMembers.map((gm) => (
              <Badge key={gm.group.name} variant="secondary">
                {gm.group.name} ({gm.group.teacher.lastName})
              </Badge>
            ))}
            {student.isBehavioral && <Badge className="bg-red-100 text-red-800">ПВД</Badge>}
            {(() => {
              const ci = getConsultationInfo({
                lastConsultationDate: student.lastConsultationDate,
                consultationIntervalMonths: student.consultationIntervalMonths,
              });
              if (ci.status === "ok" || ci.status === "missing") return null;
              const cls = ci.status === "overdue" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800";
              return (
                <Badge className={cls} title={ci.label}>
                  🔔 Консультация{ci.status === "overdue" ? " просрочена" : " скоро"}
                </Badge>
              );
            })()}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setFreezeDialog(true)}>Заморозка</Button>
          <Button variant="outline" size="sm" onClick={() => setRecalcDialog(true)}>Перерасчёт</Button>
        </div>
      </div>

      {/* KPI карточки */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500">Тариф</div>
            <div className="text-lg font-bold">
              {student.tariffType === "SUBSCRIPTION"
                ? (student.subscriptionRate
                    ? `${student.subscriptionRate.toLocaleString()} ₸/мес`
                    : "—")
                : (student.hourlyRate
                    ? `${student.hourlyRate.toLocaleString()} ₸/час`
                    : "—")}
            </div>
            <div className="text-xs text-gray-400">{student.tariffType === "SUBSCRIPTION" ? "Абонемент" : "Поурочно"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500">Посещаемость</div>
            <div className={`text-lg font-bold ${attendPct >= 80 ? "text-green-600" : attendPct >= 60 ? "text-yellow-600" : "text-red-600"}`}>
              {attendPct}%
            </div>
            <div className="text-xs text-gray-400">{attendanceStats.attended} из {attendanceStats.total} за 3 мес</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500">Начислено ({balance.month})</div>
            <div className="text-lg font-bold">{balance.charged.toLocaleString()} ₸</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500">Долг</div>
            <div className={`text-lg font-bold ${balance.debt > 0 ? "text-red-600" : "text-green-600"}`}>
              {balance.debt > 0 ? `${balance.debt.toLocaleString()} ₸` : "Нет"}
            </div>
            <div className="text-xs text-gray-400">Оплачено: {balance.paid.toLocaleString()} ₸</div>
          </CardContent>
        </Card>
      </div>

      {/* Табы */}
      <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1">
        {[
          { key: "info", label: "Информация" },
          { key: "schedule", label: "Расписание" },
          { key: "billing", label: "Часы и оплата" },
          { key: "attendance", label: "Посещения" },
          { key: "payments", label: "Оплаты" },
          { key: "freezes", label: "Заморозки" },
          { key: "crm", label: "CRM" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? "bg-white shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Контент табов */}
      {tab === "info" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Тарифная история</CardTitle></CardHeader>
            <CardContent>
              {student.tariffHistory.length === 0 ? (
                <div className="text-sm text-gray-400">Нет истории изменений</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>С</TableHead>
                      <TableHead>По</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Ставка</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {student.tariffHistory.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{t.effectiveFrom}</TableCell>
                        <TableCell>{t.effectiveTo || "Текущий"}</TableCell>
                        <TableCell>{t.tariffType === "SUBSCRIPTION" ? "Абонемент" : "Поурочно"}</TableCell>
                        <TableCell>{t.hourlyRate.toLocaleString()} ₸</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {student.notes && (
            <Card>
              <CardHeader><CardTitle className="text-base">Заметки</CardTitle></CardHeader>
              <CardContent><p className="text-sm">{student.notes}</p></CardContent>
            </Card>
          )}

          {/* Консультации — фидбек Дархана 12.06 */}
          {(() => {
            const ci = getConsultationInfo({
              lastConsultationDate: student.lastConsultationDate,
              consultationIntervalMonths: student.consultationIntervalMonths,
            });
            const statusColor =
              ci.status === "overdue" ? "bg-red-50 border-red-200" :
              ci.status === "due_soon" ? "bg-amber-50 border-amber-200" :
              ci.status === "ok" ? "bg-green-50 border-green-200" :
              "bg-gray-50 border-gray-200";
            return (
              <Card className={statusColor}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Консультации</CardTitle>
                  <div className="flex gap-2">
                    {student.lastConsultationDate && (
                      <Button variant="outline" size="sm" onClick={handleMarkConsultDone}>
                        Провести сегодня
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={openConsultDialog}>
                      Изменить
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {student.lastConsultationDate ? (
                    <div className="space-y-1 text-sm">
                      <div>
                        <span className="text-gray-500">Последняя:</span>{" "}
                        <strong>{student.lastConsultationDate}</strong>
                      </div>
                      <div>
                        <span className="text-gray-500">Интервал:</span>{" "}
                        {student.consultationIntervalMonths
                          ? `${student.consultationIntervalMonths} мес.`
                          : "не задан"}
                      </div>
                      {ci.nextDueDate && (
                        <div>
                          <span className="text-gray-500">Следующая:</span>{" "}
                          <strong>{ci.nextDueDate}</strong>
                          {" — "}
                          <span
                            className={
                              ci.status === "overdue" ? "text-red-700 font-semibold" :
                              ci.status === "due_soon" ? "text-amber-700 font-semibold" :
                              "text-gray-600"
                            }
                          >
                            {ci.label}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">
                      Консультация ещё не проводилась. Нажмите «Изменить» чтобы задать.
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {student.recalculations.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Перерасчёты</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Период</TableHead>
                      <TableHead>Сумма</TableHead>
                      <TableHead>Причина</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {student.recalculations.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.period}</TableCell>
                        <TableCell className={r.amount > 0 ? "text-red-600" : "text-green-600"}>
                          {r.amount > 0 ? `+${r.amount.toLocaleString()}` : r.amount.toLocaleString()} ₸
                        </TableCell>
                        <TableCell>{r.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "schedule" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-base">Персональное расписание</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWeekStart(addWeeks(weekStart, -1))}
                >
                  ←
                </Button>
                <span className="min-w-[140px] text-center text-sm font-medium">
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
            </div>
          </CardHeader>
          <CardContent>
            {scheduleLoading ? (
              <div className="text-sm text-gray-400">Загрузка...</div>
            ) : scheduleSlots.length === 0 ? (
              <div className="text-sm text-gray-400">Нет занятий на эту неделю</div>
            ) : (
              <div className="space-y-4">
                {DAYS_OF_WEEK.filter((d) => d.value <= 6).map((day) => {
                  const daySlots = scheduleSlots.filter((s) => s.dayOfWeek === day.value);
                  if (daySlots.length === 0) return null;
                  return (
                    <div key={day.value}>
                      <div className="mb-2 text-sm font-semibold text-gray-700">{day.full}</div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[100px]">Время</TableHead>
                            <TableHead>Педагог</TableHead>
                            <TableHead className="w-[110px]">Тип</TableHead>
                            <TableHead className="w-[110px]">Категория</TableHead>
                            <TableHead className="w-[80px]">Кабинет</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {daySlots.map((s) => (
                            <TableRow key={s.id} className={s.isCancelled ? "text-gray-400 line-through" : ""}>
                              <TableCell className="font-mono">{s.startTime}–{s.endTime}</TableCell>
                              <TableCell>{s.teacher.fullName}</TableCell>
                              <TableCell>
                                {s.lessonType === "GROUP"
                                  ? (s.group?.name ? `гр ${s.group.name}` : "Группа")
                                  : s.lessonType === "PAIR" ? "Пара" : "Индив"}
                              </TableCell>
                              <TableCell>{s.lessonCategory ?? "—"}</TableCell>
                              <TableCell>{s.room ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "billing" && (
        <div className="space-y-4">
          {/* Заголовок с еженедельной суммой + переключалка */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-gray-500">Еженедельная сумма</div>
                  <div className="text-3xl font-bold text-gray-900">
                    {(billing?.weeklyTotal ?? 0).toLocaleString()} ₸<span className="text-base font-normal text-gray-500">/нед</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBillingWeekStart(addWeeks(billingWeekStart, -1))}
                  >
                    ←
                  </Button>
                  <span className="min-w-[140px] text-center text-sm font-medium">
                    {formatWeekRange(billingWeekStart)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBillingWeekStart(addWeeks(billingWeekStart, 1))}
                  >
                    →
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Баланс месяца */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Баланс ({balance.month})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <div className="text-xs text-gray-500">Начислено</div>
                  <div className="text-xl font-semibold text-gray-900">
                    {balance.charged.toLocaleString()} ₸
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Оплачено</div>
                  <div className="text-xl font-semibold text-gray-900">
                    {balance.paid.toLocaleString()} ₸
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Баланс</div>
                  {balance.debt > 0 ? (
                    <div className="text-xl font-semibold text-red-600">
                      −{balance.debt.toLocaleString()} ₸
                      <span className="ml-2 text-xs font-normal">долг</span>
                    </div>
                  ) : balance.debt < 0 ? (
                    <div className="text-xl font-semibold text-green-600">
                      +{Math.abs(balance.debt).toLocaleString()} ₸
                      <span className="ml-2 text-xs font-normal">переплата</span>
                    </div>
                  ) : (
                    <div className="text-xl font-semibold text-gray-600">0 ₸</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Блоки по группам дней */}
          {billingLoading ? (
            <div className="text-sm text-gray-400">Загрузка...</div>
          ) : !billing || billing.groups.every((g) => g.slots.length === 0) ? (
            <div className="rounded border border-dashed p-6 text-center text-sm text-gray-400">
              Нет занятий на эту неделю
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {billing.groups.map((g) => (
                <Card key={g.dayGroup} className={g.slots.length === 0 ? "opacity-50" : ""}>
                  <CardHeader>
                    <CardTitle className="text-base">{g.label}</CardTitle>
                    <div className="text-xs text-gray-500">
                      {g.daysCount > 0
                        ? `${g.daysCount} ${g.daysCount === 1 ? "день" : g.daysCount < 5 ? "дня" : "дней"} в неделю`
                        : "Нет занятий"}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {g.slots.length === 0 ? (
                      <div className="text-sm text-gray-400">—</div>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[70px]">Время</TableHead>
                              <TableHead className="w-[70px]">Кат.</TableHead>
                              <TableHead>Педагог</TableHead>
                              <TableHead className="text-right">Цена</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {g.slots.map((s, i) => (
                              <TableRow key={`${g.dayGroup}-${i}`}>
                                <TableCell className="font-mono text-xs">{s.startTime}</TableCell>
                                <TableCell>
                                  {s.category ? (
                                    <Badge variant="secondary" className="font-normal">{s.category}</Badge>
                                  ) : "—"}
                                </TableCell>
                                <TableCell className="text-sm" title={s.teacherFull}>{s.teacher || "—"}</TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {s.price.toLocaleString()}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <div className="mt-3 border-t pt-3 text-sm">
                          <div className="flex justify-between text-gray-600">
                            <span>Сумма за день:</span>
                            <span className="font-mono">{g.daySum.toLocaleString()} ₸</span>
                          </div>
                          <div className="flex justify-between text-gray-600">
                            <span>× {g.daysCount} {g.daysCount === 1 ? "день" : g.daysCount < 5 ? "дня" : "дней"}</span>
                            <span className="font-mono font-semibold text-gray-900">
                              = {g.weekSum.toLocaleString()} ₸
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {billing && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold text-gray-700">Итого за неделю</div>
                  <div className="text-2xl font-bold text-blue-700">
                    {billing.weeklyTotal.toLocaleString()} ₸
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "attendance" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Посещения за 3 месяца</CardTitle>
            <div className="flex gap-3 text-xs text-gray-500">
              <span>Был: {attendanceStats.attended}</span>
              <span>Без причины: {attendanceStats.absent}</span>
              <span>Больничный: {attendanceStats.sick}</span>
              <span>Уважит.: {attendanceStats.validReason}</span>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Время</TableHead>
                  <TableHead>Педагог</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentAttendances.map((a, i) => (
                  <TableRow key={i}>
                    <TableCell>{a.date}</TableCell>
                    <TableCell>{a.time}</TableCell>
                    <TableCell>{a.teacher}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[a.status] || "bg-gray-100"}>
                        {STATUS_LABELS[a.status] || a.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {tab === "payments" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Оплаты</CardTitle></CardHeader>
          <CardContent>
            {student.payments.length === 0 ? (
              <div className="text-sm text-gray-400">Нет оплат</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Сумма</TableHead>
                    <TableHead>Комментарий</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {student.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.date}</TableCell>
                      <TableCell className="font-medium text-green-600">{p.amount.toLocaleString()} ₸</TableCell>
                      <TableCell>{p.note || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "freezes" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Заморозки</CardTitle></CardHeader>
          <CardContent>
            {student.studentFreezes.length === 0 ? (
              <div className="text-sm text-gray-400">Нет заморозок</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>С</TableHead>
                    <TableHead>По</TableHead>
                    <TableHead>Причина</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {student.studentFreezes.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>{f.startDate}</TableCell>
                      <TableCell>{f.endDate}</TableCell>
                      <TableCell>{f.reason}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {f.type === "SICK_LEAVE" ? "Больничный" : f.type === "VACATION" ? "Каникулы" : "Другое"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="text-red-500" onClick={() => deleteFreeze(f.id)}>
                          Удалить
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "crm" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">История взаимодействий с родителем</CardTitle>
              <Button size="sm" onClick={() => setCrmDialog(true)}>+ Записать</Button>
            </div>
          </CardHeader>
          <CardContent>
            {interactions.length === 0 ? (
              <div className="text-sm text-gray-400">Нет записей. Нажмите "Записать" чтобы добавить.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Заметка</TableHead>
                    <TableHead>Обещанная дата</TableHead>
                    <TableHead>Сумма</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interactions.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>{i.date}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {i.type === "CALL" ? "Звонок" : i.type === "MESSAGE" ? "Сообщение" : i.type === "MEETING" ? "Встреча" : i.type === "PAYMENT_PROMISE" ? "Обещание" : "Жалоба"}
                        </Badge>
                      </TableCell>
                      <TableCell>{i.note}</TableCell>
                      <TableCell>{i.promisedPayDate || "—"}</TableCell>
                      <TableCell>{i.promisedAmount ? `${i.promisedAmount.toLocaleString()} ₸` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Диалог CRM */}
      <Dialog open={crmDialog} onOpenChange={setCrmDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Записать взаимодействие</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Тип</Label>
              <select className="w-full rounded border px-3 py-2" value={crmForm.type} onChange={(e) => setCrmForm({ ...crmForm, type: e.target.value })}>
                <option value="CALL">Звонок</option>
                <option value="MESSAGE">Сообщение</option>
                <option value="MEETING">Встреча</option>
                <option value="PAYMENT_PROMISE">Обещание оплаты</option>
                <option value="COMPLAINT">Жалоба</option>
              </select>
            </div>
            <div>
              <Label>Дата</Label>
              <Input type="date" value={crmForm.date} onChange={(e) => setCrmForm({ ...crmForm, date: e.target.value })} />
            </div>
            <div>
              <Label>Заметка</Label>
              <Input value={crmForm.note} onChange={(e) => setCrmForm({ ...crmForm, note: e.target.value })} placeholder="Что обсуждали..." />
            </div>
            {crmForm.type === "PAYMENT_PROMISE" && (
              <>
                <div>
                  <Label>Обещанная дата оплаты</Label>
                  <Input type="date" value={crmForm.promisedPayDate} onChange={(e) => setCrmForm({ ...crmForm, promisedPayDate: e.target.value })} />
                </div>
                <div>
                  <Label>Обещанная сумма</Label>
                  <Input type="number" value={crmForm.promisedAmount} onChange={(e) => setCrmForm({ ...crmForm, promisedAmount: e.target.value })} placeholder="50000" />
                </div>
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCrmDialog(false)}>Отмена</Button>
              <Button onClick={handleCrm}>Сохранить</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Диалог заморозки */}
      <Dialog open={freezeDialog} onOpenChange={setFreezeDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Заморозка ученика</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Начало</Label>
              <Input type="date" value={freezeForm.startDate} onChange={(e) => setFreezeForm({ ...freezeForm, startDate: e.target.value })} />
            </div>
            <div>
              <Label>Конец</Label>
              <Input type="date" value={freezeForm.endDate} onChange={(e) => setFreezeForm({ ...freezeForm, endDate: e.target.value })} />
            </div>
            <div>
              <Label>Причина</Label>
              <Input value={freezeForm.reason} onChange={(e) => setFreezeForm({ ...freezeForm, reason: e.target.value })} placeholder="Больничный, каникулы..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFreezeDialog(false)}>Отмена</Button>
              <Button onClick={handleFreeze}>Заморозить</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Диалог перерасчёта */}
      <Dialog open={recalcDialog} onOpenChange={setRecalcDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Перерасчёт</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Сумма (+ доначисление, - возврат)</Label>
              <Input type="number" value={recalcForm.amount} onChange={(e) => setRecalcForm({ ...recalcForm, amount: e.target.value })} placeholder="-5000" />
            </div>
            <div>
              <Label>Период (YYYY-MM)</Label>
              <Input value={recalcForm.period} onChange={(e) => setRecalcForm({ ...recalcForm, period: e.target.value })} placeholder="2025-04" />
            </div>
            <div>
              <Label>Причина</Label>
              <Input value={recalcForm.reason} onChange={(e) => setRecalcForm({ ...recalcForm, reason: e.target.value })} placeholder="Перерасчёт за больничный" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRecalcDialog(false)}>Отмена</Button>
              <Button onClick={handleRecalc}>Создать</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={consultDialog} onOpenChange={setConsultDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Консультация</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Дата последней консультации</Label>
              <Input
                type="date"
                value={consultForm.date}
                onChange={(e) => setConsultForm({ ...consultForm, date: e.target.value })}
              />
              <p className="mt-1 text-xs text-gray-400">Пусто = консультация ещё не проводилась.</p>
            </div>
            <div>
              <Label>Интервал между консультациями (мес.)</Label>
              <Input
                type="number"
                min="1"
                value={consultForm.intervalMonths}
                onChange={(e) => setConsultForm({ ...consultForm, intervalMonths: e.target.value })}
                placeholder="2"
              />
              <p className="mt-1 text-xs text-gray-400">
                Дархан рекомендует 1-2 месяца для большинства, 3 для стабильных.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConsultDialog(false)}>Отмена</Button>
              <Button onClick={handleSaveConsult}>Сохранить</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
