"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
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
import { PlusIcon, PencilIcon, Trash2Icon, UsersIcon, XIcon, UserPlusIcon } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────

interface Teacher {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string | null;
}

interface Student {
  id: string;
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
  name: string;
  teacherId: string;
  teacher: Teacher;
  members: GroupMember[];
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatTeacherName(teacher: Teacher) {
  const parts = [teacher.lastName, teacher.firstName];
  if (teacher.patronymic) parts.push(teacher.patronymic);
  return parts.join(" ");
}

function formatStudentName(student: Student) {
  const parts = [student.lastName, student.firstName];
  if (student.patronymic) parts.push(student.patronymic);
  return parts.join(" ");
}

// ─── Page Component ─────────────────────────────────────────────────

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);

  // Currently selected / editing
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<Group | null>(null);
  const [viewingGroup, setViewingGroup] = useState<Group | null>(null);

  // Form fields
  const [formName, setFormName] = useState("");
  const [formTeacherId, setFormTeacherId] = useState("");
  const [formStudentIds, setFormStudentIds] = useState<string[]>([]);

  // Members dialog: add student
  const [addStudentId, setAddStudentId] = useState("");

  const [saving, setSaving] = useState(false);

  // ─── Data fetching ────────────────────────────────────────────────

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/groups");
      if (res.ok) {
        const data = await res.json();
        setGroups(data);
      }
    } catch (error) {
      console.error("Ошибка загрузки групп:", error);
    }
  }, []);

  const fetchTeachers = useCallback(async () => {
    try {
      const res = await fetch("/api/teachers");
      if (res.ok) {
        const data = await res.json();
        setTeachers(data);
      }
    } catch (error) {
      console.error("Ошибка загрузки учителей:", error);
    }
  }, []);

  const fetchStudents = useCallback(async () => {
    try {
      const res = await fetch("/api/students");
      if (res.ok) {
        const data = await res.json();
        setStudents(data);
      }
    } catch (error) {
      console.error("Ошибка загрузки учеников:", error);
    }
  }, []);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      await Promise.all([fetchGroups(), fetchTeachers(), fetchStudents()]);
      setLoading(false);
    }
    loadAll();
  }, [fetchGroups, fetchTeachers, fetchStudents]);

  // ─── Form dialog handlers ────────────────────────────────────────

  function openCreateDialog() {
    setEditingGroup(null);
    setFormName("");
    setFormTeacherId("");
    setFormStudentIds([]);
    setFormDialogOpen(true);
  }

  function openEditDialog(group: Group) {
    setEditingGroup(group);
    setFormName(group.name);
    setFormTeacherId(group.teacherId);
    setFormStudentIds(group.members.map((m) => m.studentId));
    setFormDialogOpen(true);
  }

  async function handleFormSubmit() {
    if (!formName.trim() || !formTeacherId) return;

    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        teacherId: formTeacherId,
        studentIds: formStudentIds,
      };

      let res: Response;
      if (editingGroup) {
        res = await fetch(`/api/groups/${editingGroup.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        await fetchGroups();
        setFormDialogOpen(false);
      }
    } catch (error) {
      console.error("Ошибка сохранения группы:", error);
    } finally {
      setSaving(false);
    }
  }

  // ─── Delete handlers ──────────────────────────────────────────────

  function openDeleteDialog(group: Group) {
    setDeletingGroup(group);
    setDeleteDialogOpen(true);
  }

  async function handleDelete() {
    if (!deletingGroup) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/groups/${deletingGroup.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchGroups();
        setDeleteDialogOpen(false);
        setDeletingGroup(null);
      }
    } catch (error) {
      console.error("Ошибка удаления группы:", error);
    } finally {
      setSaving(false);
    }
  }

  // ─── Members dialog handlers ──────────────────────────────────────

  function openMembersDialog(group: Group) {
    setViewingGroup(group);
    setAddStudentId("");
    setMembersDialogOpen(true);
  }

  async function handleAddMember() {
    if (!viewingGroup || !addStudentId) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/groups/${viewingGroup.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: addStudentId }),
      });

      if (res.ok) {
        await fetchGroups();
        // Update the viewing group with fresh data
        const updatedGroups = await fetch("/api/groups").then((r) => r.json());
        const updated = updatedGroups.find(
          (g: Group) => g.id === viewingGroup.id
        );
        if (updated) setViewingGroup(updated);
        setAddStudentId("");
      }
    } catch (error) {
      console.error("Ошибка добавления ученика:", error);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMember(studentId: string) {
    if (!viewingGroup) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/groups/${viewingGroup.id}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });

      if (res.ok) {
        await fetchGroups();
        // Update the viewing group with fresh data
        const updatedGroups = await fetch("/api/groups").then((r) => r.json());
        const updated = updatedGroups.find(
          (g: Group) => g.id === viewingGroup.id
        );
        if (updated) setViewingGroup(updated);
      }
    } catch (error) {
      console.error("Ошибка удаления ученика:", error);
    } finally {
      setSaving(false);
    }
  }

  // Students not already in the viewing group (for the add-member dropdown)
  const availableStudentsForMembers = viewingGroup
    ? students.filter(
        (s) =>
          s.isActive &&
          !viewingGroup.members.some((m) => m.studentId === s.id)
      )
    : [];

  // ─── Multi-select students for form ───────────────────────────────

  function toggleStudentInForm(studentId: string) {
    setFormStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  }

  // Active students not yet selected in form
  const availableStudentsForForm = students.filter(
    (s) => s.isActive && !formStudentIds.includes(s.id)
  );

  // Students currently selected in form
  const selectedStudentsForForm = students.filter((s) =>
    formStudentIds.includes(s.id)
  );

  // ─── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Группы</h1>
          <p className="text-muted-foreground">
            Управление учебными группами
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <PlusIcon />
          Создать группу
        </Button>
      </div>

      {/* Groups Table */}
      {groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <UsersIcon className="size-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-lg">Нет групп</p>
            <p className="text-muted-foreground text-sm">
              Создайте первую группу, нажав кнопку выше
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Учитель</TableHead>
                  <TableHead>Кол-во учеников</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell>
                      <button
                        onClick={() => openMembersDialog(group)}
                        className="font-medium text-primary hover:underline cursor-pointer"
                      >
                        {group.name}
                      </button>
                    </TableCell>
                    <TableCell>
                      {formatTeacherName(group.teacher)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {group.members.length}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openMembersDialog(group)}
                          title="Участники"
                        >
                          <UsersIcon />
                        </Button>
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

      {/* ─── Create / Edit Dialog ───────────────────────────────────── */}
      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingGroup ? "Редактировать группу" : "Создать группу"}
            </DialogTitle>
            <DialogDescription>
              {editingGroup
                ? "Измените данные группы и нажмите Сохранить."
                : "Заполните данные новой группы."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Name */}
            <div className="grid gap-2">
              <Label htmlFor="group-name">Название группы</Label>
              <Input
                id="group-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Например: Английский А1"
              />
            </div>

            {/* Teacher select */}
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

            {/* Students multi-select */}
            <div className="grid gap-2">
              <Label>Ученики</Label>

              {/* Selected students as badges */}
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

              {/* Dropdown to add more students */}
              {availableStudentsForForm.length > 0 && (
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

              {availableStudentsForForm.length === 0 &&
                selectedStudentsForForm.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Нет доступных учеников
                  </p>
                )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFormDialogOpen(false)}
              disabled={saving}
            >
              Отмена
            </Button>
            <Button
              onClick={handleFormSubmit}
              disabled={saving || !formName.trim() || !formTeacherId}
            >
              {saving ? "Сохранение..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ──────────────────────────────── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить группу</DialogTitle>
            <DialogDescription>
              Вы уверены, что хотите удалить группу{" "}
              <strong>{deletingGroup?.name}</strong>? Это действие нельзя
              отменить. Все связанные данные будут удалены.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={saving}
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

      {/* ─── Members Dialog ──────────────────────────────────────────── */}
      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Участники группы: {viewingGroup?.name}
            </DialogTitle>
            <DialogDescription>
              Учитель: {viewingGroup?.teacher && formatTeacherName(viewingGroup.teacher)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add member */}
            {availableStudentsForMembers.length > 0 && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label>Добавить ученика</Label>
                  <Select
                    value={addStudentId}
                    onValueChange={setAddStudentId}
                  >
                    <SelectTrigger className="w-full mt-1.5">
                      <SelectValue placeholder="Выберите ученика..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableStudentsForMembers.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {formatStudentName(student)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleAddMember}
                  disabled={saving || !addStudentId}
                  size="default"
                >
                  <UserPlusIcon />
                  Добавить
                </Button>
              </div>
            )}

            {/* Members list */}
            {viewingGroup && viewingGroup.members.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ученик</TableHead>
                    <TableHead className="text-right w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewingGroup.members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        {formatStudentName(member.student)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            handleRemoveMember(member.studentId)
                          }
                          disabled={saving}
                          title="Удалить из группы"
                        >
                          <Trash2Icon className="text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center py-6">
                <UsersIcon className="size-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  В группе пока нет учеников
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMembersDialogOpen(false)}
            >
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
