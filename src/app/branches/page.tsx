"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  _count: { teachers: number; students: number; groups: number };
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", phone: "" });

  const fetch_ = useCallback(async () => {
    const res = await fetch("/api/branches");
    if (res.ok) setBranches(await res.json());
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleCreate = async () => {
    if (!form.name) return;
    await fetch("/api/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setDialog(false);
    setForm({ name: "", address: "", phone: "" });
    fetch_();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Филиалы</h1>
        <Button onClick={() => setDialog(true)}>+ Добавить филиал</Button>
      </div>

      {branches.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          Нет филиалов. Добавьте первый филиал.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {branches.map((b) => (
            <Card key={b.id}>
              <CardContent className="pt-4">
                <h3 className="text-lg font-bold">{b.name}</h3>
                {b.address && <p className="text-sm text-gray-500">{b.address}</p>}
                {b.phone && <p className="text-sm text-gray-500">{b.phone}</p>}
                <div className="mt-3 flex gap-4 text-sm text-gray-600">
                  <span>Педагогов: <strong>{b._count.teachers}</strong></span>
                  <span>Учеников: <strong>{b._count.students}</strong></span>
                  <span>Групп: <strong>{b._count.groups}</strong></span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Новый филиал</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Название</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Основной" /></div>
            <div><Label>Адрес</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="ул. Абая 10" /></div>
            <div><Label>Телефон</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+7 777 123 45 67" /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialog(false)}>Отмена</Button>
              <Button onClick={handleCreate}>Создать</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
