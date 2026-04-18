"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface WaitlistEntry {
  id: string;
  childName: string;
  age: number | null;
  parentName: string | null;
  parentPhone: string | null;
  direction: string | null;
  preferredDays: string | null;
  preferredTime: string | null;
  priority: string;
  probability: number | null;
  status: string;
  source: string | null;
  note: string | null;
  createdAt: string;
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  HOT: { label: "Горячий", color: "bg-red-100 text-red-800" },
  WARM: { label: "Тёплый", color: "bg-yellow-100 text-yellow-800" },
  LOW: { label: "Низкий", color: "bg-gray-100 text-gray-800" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  WAITING: { label: "Ожидает", color: "bg-blue-100 text-blue-800" },
  TRIAL: { label: "Пробное", color: "bg-purple-100 text-purple-800" },
  CONVERTED: { label: "Записан", color: "bg-green-100 text-green-800" },
  CANCELLED: { label: "Отменён", color: "bg-gray-100 text-gray-800" },
};

export default function WaitlistPage() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({
    childName: "", age: "", parentName: "", parentPhone: "",
    direction: "", preferredDays: "", preferredTime: "",
    priority: "WARM", source: "", note: "",
  });

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/waitlist");
    if (res.ok) setEntries(await res.json());
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!form.childName) return;
    await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setDialog(false);
    setForm({ childName: "", age: "", parentName: "", parentPhone: "", direction: "", preferredDays: "", preferredTime: "", priority: "WARM", source: "", note: "" });
    fetchData();
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/waitlist?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchData();
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("Удалить из листа ожидания?")) return;
    await fetch(`/api/waitlist?id=${id}`, { method: "DELETE" });
    fetchData();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Лист ожидания</h1>
          <p className="text-sm text-gray-500">Дети, ожидающие место в группе</p>
        </div>
        <Button onClick={() => setDialog(true)}>+ Добавить</Button>
      </div>

      <div className="mb-4 flex gap-3 text-sm">
        <span>Всего: <strong>{entries.length}</strong></span>
        <span>Горячих: <strong className="text-red-600">{entries.filter((e) => e.priority === "HOT").length}</strong></span>
        <span>Тёплых: <strong className="text-yellow-600">{entries.filter((e) => e.priority === "WARM").length}</strong></span>
      </div>

      {entries.length === 0 ? (
        <div className="py-12 text-center text-gray-400">Лист ожидания пуст</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ребёнок</TableHead>
              <TableHead>Возраст</TableHead>
              <TableHead>Родитель</TableHead>
              <TableHead>Телефон</TableHead>
              <TableHead>Направление</TableHead>
              <TableHead>Приоритет</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Источник</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.childName}</TableCell>
                <TableCell>{e.age || "—"}</TableCell>
                <TableCell>{e.parentName || "—"}</TableCell>
                <TableCell>{e.parentPhone || "—"}</TableCell>
                <TableCell>{e.direction || "—"}</TableCell>
                <TableCell>
                  <Badge className={PRIORITY_CONFIG[e.priority]?.color || ""}>
                    {PRIORITY_CONFIG[e.priority]?.label || e.priority}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_CONFIG[e.status]?.color || ""}>
                    {STATUS_CONFIG[e.status]?.label || e.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-gray-400">{e.source || "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {e.status === "WAITING" && (
                      <Button variant="ghost" size="sm" className="text-xs text-purple-600" onClick={() => updateStatus(e.id, "TRIAL")}>
                        Пробное
                      </Button>
                    )}
                    {e.status === "TRIAL" && (
                      <Button variant="ghost" size="sm" className="text-xs text-green-600" onClick={() => updateStatus(e.id, "CONVERTED")}>
                        Записать
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-xs text-red-500" onClick={() => deleteEntry(e.id)}>
                      Удалить
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Добавить в лист ожидания</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>ФИО ребёнка *</Label><Input value={form.childName} onChange={(e) => setForm({ ...form, childName: e.target.value })} /></div>
            <div><Label>Возраст</Label><Input type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} /></div>
            <div><Label>Направление</Label><Input value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })} placeholder="АФК, Логопед..." /></div>
            <div><Label>Родитель</Label><Input value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} /></div>
            <div><Label>Телефон</Label><Input value={form.parentPhone} onChange={(e) => setForm({ ...form, parentPhone: e.target.value })} /></div>
            <div><Label>Желаемые дни</Label><Input value={form.preferredDays} onChange={(e) => setForm({ ...form, preferredDays: e.target.value })} placeholder="Пн, Ср, Пт" /></div>
            <div><Label>Желаемое время</Label><Input value={form.preferredTime} onChange={(e) => setForm({ ...form, preferredTime: e.target.value })} placeholder="10:00-12:00" /></div>
            <div>
              <Label>Приоритет</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HOT">Горячий</SelectItem>
                  <SelectItem value="WARM">Тёплый</SelectItem>
                  <SelectItem value="LOW">Низкий</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Источник</Label><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Instagram, рекомендация..." /></div>
            <div className="col-span-2"><Label>Заметка</Label><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialog(false)}>Отмена</Button>
            <Button onClick={handleCreate}>Добавить</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
