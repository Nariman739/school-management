"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlusIcon, PencilIcon, Trash2Icon, UsersIcon, XIcon } from "lucide-react";

interface Teacher {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string | null;
}

interface Student {
  id: string;
  studentNumber: number | null;
  lastName: string;
  firstName: string;
  patronymic: string | null;
  isActive: boolean;
}

interface GroupMember {
  id: string;
  studentId: string;
  student: Student;
}

interface Group {
  id: string;
  name: string | null;
  displayName?: string | null;
  groupType: "INDIVIDUAL" | "PAIR" | "GROUP";
  teacherId: string;
  teacher: Teacher;
  members: GroupMember[];
}

type GroupTabType = "GROUP" | "PAIR";

function formatTeacherName(teacher: Teacher) {
  const parts = [teacher.lastName, teacher.firstName];
  if (teacher.patronymic) parts.push(teacher.patronymic);
  return parts.join(" ");
}

function formatStudentName(student: Student) {
  // Дархан 15.06: «Адель 001 должна быть везде Адель 001 — единая форма» —
  // показываем ID везде где есть, чтобы при выборе пары/группы не путаться
  // между одноимёнными детьми.
  const base = `${student.lastName} ${student.firstName}`.trim();
  if (student.studentNumber != null) {
    return `${base} #${student.studentNumber.toString().padStart(3, "0")}`;
  }
  return base;
}

function pairDisplayName(members: GroupMember[]): string {
  if (members.length !== 2) return "—";
  return members.map((m) => formatStudentName(m.student)).join(" + ");
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<GroupTabType>("GROUP");

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<Group | null>(null);

  const [formGroupType, setFormGroupType] = useState<GroupTabType>("GROUP");
  const [formName, setFormName] = useState("");
  const [formTeacherId, setFormTeacherId] = useState("");
  const [formStudentIds, setFormStudentIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  const fetchGroups = useCallback(async () => {
    const res = await fetch("/api/groups");
    if (res.ok) setGroups(await res.json());
  }, []);

  const fetchTeachers = useCallback(async () => {
    const res = await fetch("/api/teachers");
    if (res.ok) setTeachers(await res.json());
  }, []);

  const fetchStudents = useCallback(async () => {
    const res = await fetch("/api/students");
    if (res.ok) setStudents(await res.json());
  }, []);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      await Promise.all([fetchGroups(), fetchTeachers(), fetchStudents()]);
      setLoading(false);
    }
    loadAll();
  }, [fetchGroups, fetchTeachers, fetchStudents]);

  const filteredGroups = useMemo(
    () => groups.filter((g) => (g.groupType ?? "GROUP") === activeTab),
    [groups, activeTab],
  );

  function openCreateDialog() {
    setEditingGroup(null);
    setFormGroupType(activeTab);
    setFormName("");
    setFormTeacherId("");
    setFormStudentIds([]);
    setFormError(null);
    setFormDialogOpen(true);
  }

  function openEditDialog(group: Group) {
    setEditingGroup(group);
    setFormGroupType((group.groupType as GroupTabType) ?? "GROUP");
    setFormName(group.name ?? "");
    setFormTeacherId(group.teacherId);
    setFormStudentIds(group.members.map((m) => m.studentId));
    setFormError(null);
    setFormDialogOpen(true);
  }

  function validateBeforeSubmit(): string | null {
    if (!formTeacherId) return "Выберите учителя";
    if (formGroupType === "PAIR" && formStudentIds.length !== 2) {
      return "В паре должно быть ровно 2 ученика";
    }
    if (formGroupType === "GROUP") {
      if (!formName.trim()) return "Для группы укажите название";
      if (formStudentIds.length < 2) return "В группе должно быть минимум 2 ученика";
    }
    return null;
  }

  async function handleFormSubmit() {
    const v = validateBeforeSubmit();
    if (v) {
      setFormError(v);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: formGroupType === "PAIR" ? null : formName.trim(),
        groupType: formGroupType,
        teacherId: formTeacherId,
        studentIds: formStudentIds,
      };

      const url = editingGroup ? `/api/groups/${editingGroup.id}` : "/api/groups";
      const method = editingGroup ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(data?.error || "Не удалось сохранить");
        return;
      }

      await fetchGroups();
      setFormDialogOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function openDeleteDialog(group: Group) {
    setDeletingGroup(group);
    setDeleteDialogOpen(true);
  }

  async function handleDelete() {
    if (!deletingGroup) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/groups/${deletingGroup.id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchGroups();
        setDeleteDialogOpen(false);
        setDeletingGroup(null);
      }
    } finally {
      setSaving(false);
    }
  }

  function toggleStudentInForm(studentId: string) {
    setFormStudentIds((prev) => {
      if (prev.includes(studentId)) return prev.filter((id) => id !== studentId);
      if (formGroupType === "PAIR" && prev.length >= 2) {
        return [prev[1], studentId];
      }
      return [...prev, studentId];
    });
  }

  const availableStudentsForForm = students.filter(
    (s) => s.isActive && !formStudentIds.includes(s.id),
  );
  const selectedStudentsForForm = students.filter((s) => formStudentIds.includes(s.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  const groupsCount = groups.filter((g) => (g.groupType ?? "GROUP") === "GROUP").length;
  const pairsCount = groups.filter((g) => g.groupType === "PAIR").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Группы и пары</h1>
          <p className="text-muted-foreground">
            {activeTab === "GROUP"
              ? "Учебные группы с названиями (например, грМНО)"
              : "Пары — два ученика занимаются вдвоём, имя необязательно"}
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <PlusIcon />
          {activeTab === "GROUP" ? "Создать группу" : "Создать пару"}
        </Button>
      </div>

      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab("GROUP")}
          className={`relative px-4 py-2 text-sm font-medium ${
            activeTab === "GROUP"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Группы <Badge variant="secondary" className="ml-1">{groupsCount}</Badge>
        </button>
        <button
          onClick={() => setActiveTab("PAIR")}
          className={`relative px-4 py-2 text-sm font-medium ${
            activeTab === "PAIR"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Пары <Badge variant="secondary" className="ml-1">{pairsCount}</Badge>
        </button>
      </div>

      {filteredGroups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <UsersIcon className="size-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-lg">
              {activeTab === "GROUP" ? "Нет групп" : "Нет пар"}
            </p>
            <p className="text-muted-foreground text-sm">
              {activeTab === "GROUP"
                ? "Создайте первую группу, нажав кнопку выше"
                : "Создайте первую пару — двух учеников, занимающихся вдвоём"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {activeTab === "GROUP" ? "Название" : "Состав"}
                  </TableHead>
                  <TableHead>Учитель</TableHead>
                  <TableHead>Учеников</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGroups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className="font-medium">
                      {group.groupType === "PAIR"
                        ? pairDisplayName(group.members)
                        : group.name ?? group.displayName ?? "—"}
                    </TableCell>
                    <TableCell>{formatTeacherName(group.teacher)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{group.members.length}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEditDialog(group)}
                          title="Редактировать"
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openDeleteDialog(group)}
                          title="Удалить"
                        >
                          <Trash2Icon className="text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingGroup
                ? formGroupType === "PAIR"
                  ? "Редактировать пару"
                  : "Редактировать группу"
                : formGroupType === "PAIR"
                ? "Создать пару"
                : "Создать группу"}
            </DialogTitle>
            <DialogDescription>
              {formGroupType === "PAIR"
                ? "Пара — это два ученика. Имя не требуется, оно сгенерируется автоматически."
                : "Группа имеет название и 2+ учеников."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {!editingGroup && (
              <div className="grid gap-2">
                <Label>Тип</Label>
                <Select
                  value={formGroupType}
                  onValueChange={(v) => setFormGroupType(v as GroupTabType)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GROUP">Группа (с именем, 2+ учеников)</SelectItem>
                    <SelectItem value="PAIR">Пара (без имени, 2 ученика)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {formGroupType === "GROUP" && (
              <div className="grid gap-2">
                <Label htmlFor="group-name">Название группы</Label>
                <Input
                  id="group-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Например: грМНО"
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label>Учитель</Label>
              <Select value={formTeacherId} onValueChange={setFormTeacherId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Выберите учителя" />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {formatTeacherName(teacher)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>
                Ученики {formGroupType === "PAIR" && <span className="text-xs text-muted-foreground">(ровно 2)</span>}
              </Label>

              {selectedStudentsForForm.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedStudentsForForm.map((student) => (
                    <Badge key={student.id} variant="secondary">
                      {formatStudentName(student)}
                      <button
                        type="button"
                        onClick={() => toggleStudentInForm(student.id)}
                        className="ml-1 hover:text-destructive"
                      >
                        <XIcon className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {formGroupType === "PAIR" && selectedStudentsForForm.length === 2 && (
                <div className="rounded bg-blue-50 px-3 py-2 text-sm text-blue-700">
                  Имя пары: <strong>{pairDisplayName(selectedStudentsForForm.map((s) => ({ id: s.id, studentId: s.id, student: s })))}</strong>
                </div>
              )}

              {availableStudentsForForm.length > 0 &&
                (formGroupType !== "PAIR" || selectedStudentsForForm.length < 2) && (
                  <Select
                    value=""
                    onValueChange={(value) => {
                      if (value) toggleStudentInForm(value);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Добавить ученика..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableStudentsForForm.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {formatStudentName(student)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
            </div>

            {formError && (
              <div className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormDialogOpen(false)} disabled={saving}>
              Отмена
            </Button>
            <Button onClick={handleFormSubmit} disabled={saving}>
              {saving ? "Сохранение..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Удалить {deletingGroup?.groupType === "PAIR" ? "пару" : "группу"}
            </DialogTitle>
            <DialogDescription>
              {deletingGroup?.groupType === "PAIR"
                ? `Удалить пару ${pairDisplayName(deletingGroup?.members ?? [])}?`
                : `Удалить группу «${deletingGroup?.name}»?`}{" "}
              Действие нельзя отменить.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={saving}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? "Удаление..." : "Удалить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
