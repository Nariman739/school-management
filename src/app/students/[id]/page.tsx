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

interface StudentCard {
  student: {
    id: string;
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
  const [tab, setTab] = useState<"info" | "attendance" | "payments" | "freezes">("info");

  const fetchCard = useCallback(async () => {
    const res = await fetch(`/api/students/${id}/card`);
    if (res.ok) setData(await res.json());
  }, [id]);

  useEffect(() => { fetchCard(); }, [fetchCard]);

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
              {student.tariffType === "SUBSCRIPTION" ? `${student.subscriptionRate?.toLocaleString()} ₸/мес` : `${student.hourlyRate.toLocaleString()} ₸/час`}
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
          { key: "attendance", label: "Посещения" },
          { key: "payments", label: "Оплаты" },
          { key: "freezes", label: "Заморозки" },
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
    </div>
  );
}
