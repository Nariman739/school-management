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
import { Badge } from "@/components/ui/badge";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  teacherId: string | null;
  isActive: boolean;
  createdAt: string;
  teacher: { lastName: string; firstName: string } | null;
}

interface Teacher {
  id: string;
  lastName: string;
  firstName: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Администратор",
  DIRECTOR: "Руководитель",
  TEACHER: "Педагог",
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-blue-100 text-blue-800",
  DIRECTOR: "bg-purple-100 text-purple-800",
  TEACHER: "bg-green-100 text-green-800",
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "ADMIN",
    teacherId: "",
  });
  const [error, setError] = useState("");

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers(await res.json());
  }, []);

  const fetchTeachers = useCallback(async () => {
    const res = await fetch("/api/teachers");
    if (res.ok) setTeachers(await res.json());
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchTeachers();
  }, [fetchUsers, fetchTeachers]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        teacherId: form.teacherId || null,
      }),
    });

    if (res.ok) {
      setShowDialog(false);
      setForm({ email: "", password: "", name: "", role: "ADMIN", teacherId: "" });
      fetchUsers();
    } else {
      const data = await res.json();
      setError(data.error || "Ошибка");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Деактивировать пользователя?")) return;
    const res = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
    if (res.ok) fetchUsers();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Пользователи</h1>
        <Button onClick={() => setShowDialog(true)}>+ Добавить</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Имя</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Роль</TableHead>
            <TableHead>Привязка к педагогу</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Badge className={ROLE_COLORS[user.role] || ""}>
                  {ROLE_LABELS[user.role] || user.role}
                </Badge>
              </TableCell>
              <TableCell>
                {user.teacher
                  ? `${user.teacher.lastName} ${user.teacher.firstName}`
                  : "—"}
              </TableCell>
              <TableCell>
                <Badge variant={user.isActive ? "default" : "secondary"}>
                  {user.isActive ? "Активен" : "Отключён"}
                </Badge>
              </TableCell>
              <TableCell>
                {user.isActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500"
                    onClick={() => handleDelete(user.id)}
                  >
                    Отключить
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый пользователь</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Имя</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Айнура"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="ainura@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Пароль</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Минимум 6 символов"
                required
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label>Роль</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Администратор</SelectItem>
                  <SelectItem value="DIRECTOR">Руководитель</SelectItem>
                  <SelectItem value="TEACHER">Педагог</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.role === "TEACHER" && (
              <div className="space-y-2">
                <Label>Привязать к педагогу</Label>
                <Select
                  value={form.teacherId}
                  onValueChange={(v) => setForm({ ...form, teacherId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите педагога" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.lastName} {t.firstName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full">
              Создать
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
