"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface StudentBalance {
  studentId: string;
  studentName: string;
  parentName: string;
  parentPhone: string;
  hourlyRate: number;
  charged: number;
  paid: number;
  balance: number;
}

interface PaymentRecord {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  date: string;
  note: string | null;
  createdAt: string;
}

export default function PaymentsPage() {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [balances, setBalances] = useState<StudentBalance[]>([]);
  const [loading, setLoading] = useState(false);

  // Диалог внесения оплаты
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payStudentId, setPayStudentId] = useState("");
  const [payStudentName, setPayStudentName] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");

  // Диалог истории оплат
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyStudent, setHistoryStudent] = useState("");
  const [historyStudentName, setHistoryStudentName] = useState("");
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  const fetchBalances = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/students/balance?month=${month}`);
    if (res.ok) {
      setBalances(await res.json());
    }
    setLoading(false);
  }, [month]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const openPayDialog = (studentId: string, studentName: string) => {
    setPayStudentId(studentId);
    setPayStudentName(studentName);
    setPayAmount("");
    setPayNote("");
    setPayDialogOpen(true);
  };

  const submitPayment = async () => {
    if (!payAmount || Number(payAmount) <= 0) return;

    const today = new Date().toISOString().split("T")[0];
    await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: payStudentId,
        amount: Number(payAmount),
        date: today,
        note: payNote || null,
      }),
    });

    setPayDialogOpen(false);
    fetchBalances();
  };

  const openHistory = async (studentId: string, studentName: string) => {
    setHistoryStudent(studentId);
    setHistoryStudentName(studentName);
    setHistoryOpen(true);
    const res = await fetch(`/api/payments?studentId=${studentId}`);
    if (res.ok) {
      setPayments(await res.json());
    }
  };

  const deletePayment = async (paymentId: string) => {
    if (!confirm("Удалить эту оплату?")) return;
    await fetch(`/api/payments?id=${paymentId}`, { method: "DELETE" });
    setPayments((prev) => prev.filter((p) => p.id !== paymentId));
    fetchBalances();
  };

  const totalCharged = balances.reduce((acc, b) => acc + b.charged, 0);
  const totalPaid = balances.reduce((acc, b) => acc + b.paid, 0);
  const totalDebt = balances.reduce(
    (acc, b) => acc + (b.balance < 0 ? Math.abs(b.balance) : 0),
    0
  );

  const monthName = (() => {
    const [y, m] = month.split("-");
    const months = [
      "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
    ];
    return `${months[Number(m) - 1]} ${y}`;
  })();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Оплата</h1>

      {/* Фильтр по месяцу */}
      <div className="mb-6 flex items-center gap-4">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded border px-3 py-1.5 text-sm"
        />
        <span className="text-lg font-medium">{monthName}</span>

        <div className="ml-auto flex gap-4 text-sm">
          <span>
            Начислено: <strong>{totalCharged.toLocaleString()} ₸</strong>
          </span>
          <span>
            Оплачено:{" "}
            <strong className="text-green-600">
              {totalPaid.toLocaleString()} ₸
            </strong>
          </span>
          <span>
            Долг:{" "}
            <strong className="text-red-600">
              {totalDebt.toLocaleString()} ₸
            </strong>
          </span>
        </div>
      </div>

      {/* Таблица балансов */}
      {loading ? (
        <div className="text-center text-gray-400">Загрузка...</div>
      ) : balances.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          Нет данных за этот месяц
        </div>
      ) : (
        <div className="space-y-3">
          {balances.map((b) => (
            <Card
              key={b.studentId}
              className={b.balance < 0 ? "border-red-200" : ""}
            >
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <div className="font-medium">{b.studentName}</div>
                  <div className="text-xs text-gray-500">
                    {b.parentName} · {b.parentPhone} · {b.hourlyRate} ₸/час
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right text-sm">
                    <div>
                      Начислено:{" "}
                      <span className="font-medium">
                        {b.charged.toLocaleString()} ₸
                      </span>
                    </div>
                    <div>
                      Оплачено:{" "}
                      <span className="font-medium text-green-600">
                        {b.paid.toLocaleString()} ₸
                      </span>
                    </div>
                  </div>

                  <Badge
                    variant="secondary"
                    className={
                      b.balance < 0
                        ? "bg-red-100 text-red-700"
                        : b.balance > 0
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                    }
                  >
                    {b.balance < 0
                      ? `Долг: ${Math.abs(b.balance).toLocaleString()} ₸`
                      : b.balance > 0
                        ? `Переплата: ${b.balance.toLocaleString()} ₸`
                        : "Оплачено"}
                  </Badge>

                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      onClick={() => openPayDialog(b.studentId, b.studentName)}
                    >
                      Внести оплату
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openHistory(b.studentId, b.studentName)}
                    >
                      История
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Диалог внесения оплаты */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Внести оплату — {payStudentName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Сумма (₸)</label>
              <Input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="30000"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Комментарий (необязательно)
              </label>
              <Input
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                placeholder="Оплата за 1-2 неделю"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPayDialogOpen(false)}>
                Отмена
              </Button>
              <Button onClick={submitPayment} disabled={!payAmount || Number(payAmount) <= 0}>
                Внести
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Диалог истории оплат */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>История оплат — {historyStudentName}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[400px] space-y-2 overflow-y-auto">
            {payments.length === 0 ? (
              <p className="text-sm text-gray-400">Оплат пока нет</p>
            ) : (
              payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded border px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {p.amount.toLocaleString()} ₸
                    </div>
                    <div className="text-xs text-gray-500">
                      {p.date}
                      {p.note && ` · ${p.note}`}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500 hover:text-red-700"
                    onClick={() => deletePayment(p.id)}
                  >
                    Удалить
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
