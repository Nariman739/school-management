"use client";

import { useEffect, useState, useCallback } from "react";
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
  lastName: string;
  firstName: string;
  patronymic: string | null;
  parentName: string | null;
  parentPhone: string | null;
  hourlyRate: number;
  isActive: boolean;
}

interface StudentFormData {
  lastName: string;
  firstName: string;
  patronymic: string;
  parentName: string;
  parentPhone: string;
  hourlyRate: string;
}

const emptyForm: StudentFormData = {
  lastName: "",
  firstName: "",
  patronymic: "",
  parentName: "",
  parentPhone: "",
  hourlyRate: "",
};

function formatRate(rate: number): string {
  return `${rate.toLocaleString("ru-RU")} \u20B8/час`;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [formData, setFormData] = useState<StudentFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/students");
      if (!response.ok) {
        throw new Error("Ошибка загрузки");
      }
      const data = await response.json();
      setStudents(data);
    } catch {
      setError("Не удалось загрузить список учеников");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  function openCreateDialog() {
    setEditingStudent(null);
    setFormData(emptyForm);
    setError(null);
    setDialogOpen(true);
  }

  function openEditDialog(student: Student) {
    setEditingStudent(student);
    setFormData({
      lastName: student.lastName,
      firstName: student.firstName,
      patronymic: student.patronymic ?? "",
      parentName: student.parentName ?? "",
      parentPhone: student.parentPhone ?? "",
      hourlyRate: student.hourlyRate ? String(student.hourlyRate) : "",
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
      const payload = {
        lastName: formData.lastName.trim(),
        firstName: formData.firstName.trim(),
        patronymic: formData.patronymic.trim() || null,
        parentName: formData.parentName.trim() || null,
        parentPhone: formData.parentPhone.trim() || null,
        hourlyRate: formData.hourlyRate ? parseInt(formData.hourlyRate, 10) : 0,
      };

      const url = editingStudent
        ? `/api/students/${editingStudent.id}`
        : "/api/students";
      const method = editingStudent ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Произошла ошибка");
      }

      setDialogOpen(false);
      setFormData(emptyForm);
      setEditingStudent(null);
      await fetchStudents();
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
      await fetchStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка при удалении");
    } finally {
      setSaving(false);
    }
  }

  function handleInputChange(field: keyof StudentFormData, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Ученики</h1>
        <Button onClick={openCreateDialog}>Добавить ученика</Button>
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
                <TableHead>Фамилия</TableHead>
                <TableHead>Имя</TableHead>
                <TableHead>Отчество</TableHead>
                <TableHead>Родитель</TableHead>
                <TableHead>Телефон родителя</TableHead>
                <TableHead className="text-right">Ставка</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-medium">
                    {student.lastName}
                  </TableCell>
                  <TableCell>{student.firstName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {student.patronymic || "\u2014"}
                  </TableCell>
                  <TableCell>
                    {student.parentName || "\u2014"}
                  </TableCell>
                  <TableCell>
                    {student.parentPhone || "\u2014"}
                  </TableCell>
                  <TableCell className="text-right">
                    {student.hourlyRate > 0
                      ? formatRate(student.hourlyRate)
                      : "\u2014"}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingStudent ? "Редактировать ученика" : "Добавить ученика"}
            </DialogTitle>
            <DialogDescription>
              {editingStudent
                ? "Измените данные ученика и нажмите Сохранить."
                : "Заполните данные нового ученика."}
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
                  onChange={(e) =>
                    handleInputChange("patronymic", e.target.value)
                  }
                  placeholder="Иванович"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="parentName">Имя родителя</Label>
                <Input
                  id="parentName"
                  value={formData.parentName}
                  onChange={(e) =>
                    handleInputChange("parentName", e.target.value)
                  }
                  placeholder="Иванова Мария Петровна"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="parentPhone">Телефон родителя</Label>
                <Input
                  id="parentPhone"
                  value={formData.parentPhone}
                  onChange={(e) =>
                    handleInputChange("parentPhone", e.target.value)
                  }
                  placeholder="+7 (777) 123-45-67"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="hourlyRate">Ставка (тенге/час)</Label>
                <Input
                  id="hourlyRate"
                  type="number"
                  min="0"
                  step="100"
                  value={formData.hourlyRate}
                  onChange={(e) =>
                    handleInputChange("hourlyRate", e.target.value)
                  }
                  placeholder="5000"
                />
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
