"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Notification {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  DEBT_OVERDUE: { icon: "💰", color: "border-l-red-500" },
  CONSECUTIVE_ABSENCES: { icon: "⚠️", color: "border-l-yellow-500" },
  SUBSTITUTION: { icon: "🔄", color: "border-l-purple-500" },
  ATTENDANCE_DROP: { icon: "📉", color: "border-l-orange-500" },
  LESSONS_ENDING: { icon: "⏰", color: "border-l-blue-500" },
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [checking, setChecking] = useState(false);

  const fetchNotifications = useCallback(async () => {
    const res = await fetch("/api/notifications");
    if (res.ok) setNotifications(await res.json());
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markRead = async (id: string) => {
    await fetch(`/api/notifications?id=${id}`, { method: "PATCH" });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
  };

  const markAllRead = async () => {
    await fetch("/api/notifications?id=all", { method: "PATCH" });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const checkTriggers = async () => {
    setChecking(true);
    const res = await fetch("/api/notifications", { method: "POST" });
    const data = await res.json();
    setChecking(false);
    if (data.created > 0) {
      alert(`Создано ${data.created} уведомлений`);
      fetchNotifications();
    } else {
      alert("Новых уведомлений нет");
    }
  };

  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Уведомления
          {unread > 0 && <Badge className="ml-2 bg-red-500 text-white">{unread}</Badge>}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={checkTriggers} disabled={checking}>
            {checking ? "Проверяю..." : "Проверить"}
          </Button>
          {unread > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              Прочитать все
            </Button>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          Нет уведомлений. Нажмите "Проверить" чтобы запустить проверку триггеров.
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => {
            const config = TYPE_CONFIG[n.type] || { icon: "📋", color: "border-l-gray-500" };
            return (
              <Card
                key={n.id}
                className={`border-l-4 ${config.color} ${n.isRead ? "opacity-60" : ""} cursor-pointer`}
                onClick={() => !n.isRead && markRead(n.id)}
              >
                <CardContent className="flex items-start gap-3 py-3">
                  <span className="text-xl">{config.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{n.title}</span>
                      {!n.isRead && <Badge className="bg-blue-100 text-blue-800 text-xs">Новое</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{n.message}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {new Date(n.createdAt).toLocaleString("ru-RU")}
                    </p>
                  </div>
                  {n.entityType === "Student" && (
                    <a
                      href={`/students/${n.entityId}`}
                      className="text-sm text-blue-600 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Открыть
                    </a>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
