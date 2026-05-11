"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ServiceType {
  id: string;
  code: string;
  name: string;
  kind: "INDIVIDUAL" | "PAIR" | "GROUP";
  isActive: boolean;
  sortOrder: number;
}

const KIND_LABELS: Record<string, string> = {
  INDIVIDUAL: "Индивид",
  PAIR: "Пара",
  GROUP: "Группа",
};

const KIND_BADGES: Record<string, string> = {
  INDIVIDUAL: "bg-blue-100 text-blue-700",
  PAIR: "bg-purple-100 text-purple-700",
  GROUP: "bg-green-100 text-green-700",
};

const emptyForm = { code: "", name: "", kind: "INDIVIDUAL" as ServiceType["kind"], sortOrder: 0, isActive: true };

export default function ServicesPage() {
  const [services, setServices] = useState<ServiceType[]>([]);
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<ServiceType | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/services");
    if (res.ok) setServices(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setDialog(true);
  };

  const openEdit = (svc: ServiceType) => {
    setEditing(svc);
    setForm({ code: svc.code, name: svc.name, kind: svc.kind, sortOrder: svc.sortOrder, isActive: svc.isActive });
    setError(null);
    setDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      setError("Заполните код и название");
      return;
    }
    const url = editing ? `/api/services/${editing.id}` : "/api/services";
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || "Не удалось сохранить");
      return;
    }
    setDialog(false);
    fetchAll();
  };

  const handleToggle = async (svc: ServiceType) => {
    await fetch(`/api/services/${svc.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !svc.isActive }),
    });
    fetchAll();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Типы услуг</h1>
          <p className="text-sm text-muted-foreground">
            Справочник видов занятий. Цена за каждый тип задаётся отдельно у ученика.
          </p>
        </div>
        <Button onClick={openCreate}>+ Добавить тип</Button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400">Загрузка…</div>
      ) : services.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          Пока нет типов услуг. Добавьте первый — например «Индивид Н» или «Пара».
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {services.map((svc) => (
            <Card key={svc.id} className={!svc.isActive ? "opacity-50" : ""}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold">{svc.name}</h3>
                    <p className="text-xs text-gray-500">код: {svc.code}</p>
                  </div>
                  <span className={`rounded px-2 py-1 text-xs font-medium ${KIND_BADGES[svc.kind]}`}>
                    {KIND_LABELS[svc.kind]}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(svc)}>
                    Изменить
                  </Button>
                  <Button
                    size="sm"
                    variant={svc.isActive ? "outline" : "default"}
                    onClick={() => handleToggle(svc)}
                  >
                    {svc.isActive ? "Скрыть" : "Включить"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Изменить тип услуги" : "Новый тип услуги"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Код (латиницей, без пробелов)</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="IND_N"
                disabled={!!editing}
              />
              {editing && <p className="mt-1 text-xs text-gray-400">Код менять нельзя</p>}
            </div>
            <div>
              <Label>Название</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Индивид Н"
              />
            </div>
            <div>
              <Label>Категория</Label>
              <select
                className="w-full rounded border px-3 py-2 text-sm"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as ServiceType["kind"] })}
              >
                <option value="INDIVIDUAL">Индивидуальное занятие</option>
                <option value="PAIR">Парное занятие</option>
                <option value="GROUP">Групповое занятие</option>
              </select>
            </div>
            <div>
              <Label>Порядок сортировки</Label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value || "0", 10) })}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialog(false)}>
                Отмена
              </Button>
              <Button onClick={handleSave}>{editing ? "Сохранить" : "Создать"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
