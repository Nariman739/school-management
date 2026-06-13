"use client";

import { useEffect, useState, useCallback } from "react";
import { getConsultationInfo } from "@/lib/consultation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Student {
  id: string;
  studentNumber: number | null;
  lastName: string;
  firstName: string;
  patronymic: string | null;
  parentName: string | null;
  parentPhone: string | null;
  hourlyRate: number;
  isActive: boolean;
  lastConsultationDate: string | null;
  consultationIntervalMonths: number | null;
}

interface ServiceType {
  id: string;
  code: string;
  name: string;
  kind: string;
  isActive: boolean;
  sortOrder: number;
}

interface StudentPrice {
  id: string;
  studentId: string;
  serviceTypeId: string;
  price: number;
  serviceType: ServiceType;
}

interface StudentFormData {
  lastName: string;
  firstName: string;
  patronymic: string;
  parentName: string;
  parentPhone: string;
  prices: Record<string, string>; // serviceTypeId → price as string
}

const emptyForm: StudentFormData = {
  lastName: "",
  firstName: "",
  patronymic: "",
  parentName: "",
  parentPhone: "",
  prices: {},
};

function formatPrice(price: number): string {
  return `${price.toLocaleString("ru-RU")} ₸`;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [pricesByStudent, setPricesByStudent] = useState<Record<string, StudentPrice[]>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [formData, setFormData] = useState<StudentFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [studentsRes, servicesRes] = await Promise.all([
        fetch("/api/students"),
        fetch("/api/services"),
      ]);
      if (!studentsRes.ok) throw new Error("Ошибка загрузки учеников");
      if (!servicesRes.ok) throw new Error("Ошибка загрузки услуг");

      const studentsData: Student[] = await studentsRes.json();
      const servicesData: ServiceType[] = await servicesRes.json();
      setStudents(studentsData);
      setServices(servicesData.filter((s) => s.isActive));

      // Подтянуть цены для каждого ученика параллельно
      const pricesEntries = await Promise.all(
        studentsData.map(async (s) => {
          const r = await fetch(`/api/students/${s.id}/prices`);
          if (!r.ok) return [s.id, [] as StudentPrice[]] as const;
          const arr: StudentPrice[] = await r.json();
          return [s.id, arr] as const;
        }),
      );
      setPricesByStudent(Object.fromEntries(pricesEntries));
    } catch {
      setError("Не удалось загрузить список учеников");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function openCreateDialog() {
    setEditingStudent(null);
    setFormData({ ...emptyForm, prices: Object.fromEntries(services.map((s) => [s.id, ""])) });
    setError(null);
    setDialogOpen(true);
  }

  function openEditDialog(student: Student) {
    setEditingStudent(student);
    const existing = pricesByStudent[student.id] || [];
    const pricesMap: Record<string, string> = {};
    for (const svc of services) {
      const found = existing.find((p) => p.serviceTypeId === svc.id);
      pricesMap[svc.id] = found ? String(found.price) : "";
    }
    setFormData({
      lastName: student.lastName,
      firstName: student.firstName,
      patronymic: student.patronymic ?? "",
      parentName: student.parentName ?? "",
      parentPhone: student.parentPhone ?? "",
      prices: pricesMap,
    });
    setError(null);
    setDialogOpen(true);
  }

  function openDeleteDialog(student: Student) {
    setDeletingStudent(student);
    setDeleteDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!formData.lastName.trim() || !formData.firstName.trim()) {
      setError("Фамилия и имя обязательны для заполнения");
      return;
    }

    setSaving(true);

    try {
      const pricesPayload = Object.entries(formData.prices).map(([serviceTypeId, raw]) => ({
        serviceTypeId,
        price: raw ? parseInt(raw, 10) || 0 : 0,
      }));

      const basePayload = {
        lastName: formData.lastName.trim(),
        firstName: formData.firstName.trim(),
        patronymic: formData.patronymic.trim() || null,
        parentName: formData.parentName.trim() || null,
        parentPhone: formData.parentPhone.trim() || null,
      };

      let studentId: string;
      if (editingStudent) {
        const r = await fetch(`/api/students/${editingStudent.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(basePayload),
        });
        if (!r.ok) throw new Error((await r.json()).error || "Не удалось сохранить");
        studentId = editingStudent.id;
      } else {
        const r = await fetch("/api/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(basePayload),
        });
        if (!r.ok) throw new Error((await r.json()).error || "Не удалось создать");
        const created = await r.json();
        studentId = created.id;
      }

      // Сохраняем цены
      await fetch(`/api/students/${studentId}/prices`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices: pricesPayload }),
      });

      setDialogOpen(false);
      setFormData(emptyForm);
      setEditingStudent(null);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletingStudent) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/students/${deletingStudent.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Произошла ошибка");
      }

      setDeleteDialogOpen(false);
      setDeletingStudent(null);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка при удалении");
    } finally {
      setSaving(false);
    }
  }

  function handleInputChange(field: keyof Omit<StudentFormData, "prices">, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function handlePriceChange(serviceTypeId: string, value: string) {
    setFormData((prev) => ({ ...prev, prices: { ...prev.prices, [serviceTypeId]: value } }));
  }

  function renderPricesSummary(studentId: string, fallbackHourlyRate: number) {
    const prices = pricesByStudent[studentId];
    if (!prices || prices.length === 0) {
      return fallbackHourlyRate > 0
        ? <span className="text-muted-foreground">{formatPrice(fallbackHourlyRate)} <span className="text-xs">(legacy)</span></span>
        : <span className="text-muted-foreground">—</span>;
    }
    const sorted = [...prices].sort((a, b) => a.serviceType.sortOrder - b.serviceType.sortOrder);
    return (
      <div className="flex flex-wrap justify-end gap-1">
        {sorted.map((p) => (
          <span
            key={p.id}
            className="rounded bg-gray-100 px-2 py-0.5 text-xs"
            title={p.serviceType.name}
          >
            {p.serviceType.name}: <strong>{formatPrice(p.price)}</strong>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Ученики</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.open("/api/students/export", "_blank")}>📥 Excel</Button>
          <Button onClick={openCreateDialog}>Добавить ученика</Button>
        </div>
      </div>

      {error && !dialogOpen && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-md p-3 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          Загрузка...
        </div>
      ) : students.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Нет учеников. Нажмите &laquo;Добавить ученика&raquo; для добавления.
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">№</TableHead>
                <TableHead>Фамилия</TableHead>
                <TableHead>Имя</TableHead>
                <TableHead>Отчество</TableHead>
                <TableHead>Родитель</TableHead>
                <TableHead>Телефон родителя</TableHead>
                <TableHead className="text-right">Ставки</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="text-muted-foreground font-mono">
                    {student.studentNumber ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium">
                    <a href={`/students/${student.id}`} className="text-blue-600 hover:underline">
                      {student.lastName}
                    </a>
                    {(() => {
                      const ci = getConsultationInfo({
                        lastConsultationDate: student.lastConsultationDate,
                        consultationIntervalMonths: student.consultationIntervalMonths,
                      });
                      if (ci.status === "overdue") {
                        return <span className="ml-2 text-red-600" title={ci.label}>🔔</span>;
                      }
                      if (ci.status === "due_soon") {
                        return <span className="ml-2 text-amber-500" title={ci.label}>🔔</span>;
                      }
                      return null;
                    })()}
                  </TableCell>
                  <TableCell>{student.firstName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {student.patronymic || "—"}
                  </TableCell>
                  <TableCell>
                    {student.parentName || "—"}
                  </TableCell>
                  <TableCell>
                    {student.parentPhone || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {renderPricesSummary(student.id, student.hourlyRate)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(student)}
                      >
                        Изменить
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => openDeleteDialog(student)}
                      >
                        Удалить
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingStudent ? "Редактировать ученика" : "Добавить ученика"}
            </DialogTitle>
            <DialogDescription>
              {editingStudent
                ? "Измените данные ученика и цены по типам услуг."
                : "Заполните данные нового ученика и цены по типам услуг."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              {error && dialogOpen && (
                <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-md p-3 text-sm">
                  {error}
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="lastName">
                  Фамилия <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => handleInputChange("lastName", e.target.value)}
                  placeholder="Иванов"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="firstName">
                  Имя <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange("firstName", e.target.value)}
                  placeholder="Иван"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="patronymic">Отчество</Label>
                <Input
                  id="patronymic"
                  value={formData.patronymic}
                  onChange={(e) => handleInputChange("patronymic", e.target.value)}
                  placeholder="Иванович"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="parentName">Имя родителя</Label>
                <Input
                  id="parentName"
                  value={formData.parentName}
                  onChange={(e) => handleInputChange("parentName", e.target.value)}
                  placeholder="Иванова Мария Петровна"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="parentPhone">Телефон родителя</Label>
                <Input
                  id="parentPhone"
                  value={formData.parentPhone}
                  onChange={(e) => handleInputChange("parentPhone", e.target.value)}
                  placeholder="+7 (777) 123-45-67"
                />
              </div>

              <div className="grid gap-2 pt-2">
                <Label>Цены по типам услуг (₸/час)</Label>
                {services.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Сначала создайте типы услуг в разделе &laquo;Услуги&raquo;.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {services
                      .slice()
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((svc) => (
                        <div key={svc.id} className="grid grid-cols-[1fr_140px] items-center gap-2">
                          <span className="text-sm">{svc.name}</span>
                          <Input
                            type="number"
                            min="0"
                            step="100"
                            value={formData.prices[svc.id] ?? ""}
                            onChange={(e) => handlePriceChange(svc.id, e.target.value)}
                            placeholder="0"
                          />
                        </div>
                      ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Оставьте пустым (или 0), если для этого типа услуга не предоставляется.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Удалить ученика</DialogTitle>
            <DialogDescription>
              Вы уверены, что хотите удалить ученика{" "}
              <strong>
                {deletingStudent?.lastName} {deletingStudent?.firstName}
              </strong>
              ? Это действие можно будет отменить через базу данных.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={saving}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
            >
              {saving ? "Удаление..." : "Удалить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
