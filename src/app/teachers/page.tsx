"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import { Pencil, Trash2, Plus } from "lucide-react";
interface Teacher {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string | null;
  phone: string | null;
  individualRate: number;
  groupRate: number;
  isActive: boolean;
}

interface TeacherFormData {
  lastName: string;
  firstName: string;
  patronymic: string;
  phone: string;
  individualRate: string;
  groupRate: string;
}

const emptyForm: TeacherFormData = {
  lastName: "",
  firstName: "",
  patronymic: "",
  phone: "",
  individualRate: "0",
  groupRate: "0",
};

function formatRate(value: number): string {
  return `${value.toLocaleString("ru-RU")} \u20B8`;
}

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [deletingTeacher, setDeletingTeacher] = useState<Teacher | null>(null);
  const [formData, setFormData] = useState<TeacherFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchTeachers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/teachers");
      if (!response.ok) {
        throw new Error("Ошибка загрузки данных");
      }
      const data = await response.json();
      setTeachers(data);
    } catch (error) {
      console.error("Ошибка при загрузке учителей:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeachers();
  }, [fetchTeachers]);

  function openCreateDialog() {
    setEditingTeacher(null);
    setFormData(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(teacher: Teacher) {
    setEditingTeacher(teacher);
    setFormData({
      lastName: teacher.lastName,
      firstName: teacher.firstName,
      patronymic: teacher.patronymic ?? "",
      phone: teacher.phone ?? "",
      individualRate: String(teacher.individualRate),
      groupRate: String(teacher.groupRate),
    });
    setDialogOpen(true);
  }

  function openDeleteDialog(teacher: Teacher) {
    setDeletingTeacher(teacher);
    setDeleteDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        lastName: formData.lastName.trim(),
        firstName: formData.firstName.trim(),
        patronymic: formData.patronymic.trim() || null,
        phone: formData.phone.trim() || null,
        individualRate: parseInt(formData.individualRate, 10) || 0,
        groupRate: parseInt(formData.groupRate, 10) || 0,
      };

      const url = editingTeacher
        ? `/api/teachers/${editingTeacher.id}`
        : "/api/teachers";
      const method = editingTeacher ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Ошибка сохранения");
      }

      setDialogOpen(false);
      setEditingTeacher(null);
      setFormData(emptyForm);
      await fetchTeachers();
    } catch (error) {
      console.error("Ошибка при сохранении учителя:", error);
      alert(
        error instanceof Error ? error.message : "Не удалось сохранить данные"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deletingTeacher) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/teachers/${deletingTeacher.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Ошибка удаления");
      }

      setDeleteDialogOpen(false);
      setDeletingTeacher(null);
      await fetchTeachers();
    } catch (error) {
      console.error("Ошибка при удалении учителя:", error);
      alert(
        error instanceof Error ? error.message : "Не удалось удалить учителя"
      );
    } finally {
      setSaving(false);
    }
  }

  function getFullName(teacher: Teacher): string {
    const parts = [teacher.lastName, teacher.firstName];
    if (teacher.patronymic) {
      parts.push(teacher.patronymic);
    }
    return parts.join(" ");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Учителя</CardTitle>
          <CardAction>
            <Button onClick={openCreateDialog}>
              <Plus />
              Добавить учителя
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Загрузка...</p>
            </div>
          ) : teachers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">
                Список учителей пуст
              </p>
              <Button variant="outline" onClick={openCreateDialog}>
                <Plus />
                Добавить первого учителя
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ФИО</TableHead>
                  <TableHead>Телефон</TableHead>
                  <TableHead className="text-right">Ставка инд.</TableHead>
                  <TableHead className="text-right">Ставка групп.</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teachers.map((teacher) => (
                  <TableRow key={teacher.id}>
                    <TableCell className="font-medium">
                      {getFullName(teacher)}
                    </TableCell>
                    <TableCell>{teacher.phone ?? "\u2014"}</TableCell>
                    <TableCell className="text-right">
                      {formatRate(teacher.individualRate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatRate(teacher.groupRate)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEditDialog(teacher)}
                          title="Редактировать"
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openDeleteDialog(teacher)}
                          title="Удалить"
                        >
                          <Trash2 className="text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Диалог создания / редактирования */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTeacher
                ? "Редактировать учителя"
                : "Добавить учителя"}
            </DialogTitle>
            <DialogDescription>
              {editingTeacher
                ? "Измените данные учителя и нажмите Сохранить."
                : "Заполните данные нового учителя и нажмите Сохранить."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="lastName" className="text-right">
                  Фамилия *
                </Label>
                <Input
                  id="lastName"
                  className="col-span-3"
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      lastName: e.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="firstName" className="text-right">
                  Имя *
                </Label>
                <Input
                  id="firstName"
                  className="col-span-3"
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      firstName: e.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="patronymic" className="text-right">
                  Отчество
                </Label>
                <Input
                  id="patronymic"
                  className="col-span-3"
                  value={formData.patronymic}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      patronymic: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="phone" className="text-right">
                  Телефон
                </Label>
                <Input
                  id="phone"
                  className="col-span-3"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      phone: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="individualRate" className="text-right">
                  Ставка инд. (\u20B8)
                </Label>
                <Input
                  id="individualRate"
                  className="col-span-3"
                  type="number"
                  min="0"
                  value={formData.individualRate}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      individualRate: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="groupRate" className="text-right">
                  Ставка групп. (\u20B8)
                </Label>
                <Input
                  id="groupRate"
                  className="col-span-3"
                  type="number"
                  min="0"
                  value={formData.groupRate}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      groupRate: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
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

      {/* Диалог подтверждения удаления */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить учителя</DialogTitle>
            <DialogDescription>
              Вы уверены, что хотите удалить учителя{" "}
              <strong>
                {deletingTeacher ? getFullName(deletingTeacher) : ""}
              </strong>
              ? Это действие можно будет отменить через базу данных.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Отмена
            </Button>
            <Button
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
