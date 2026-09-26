"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type Row = {
  studentId: string;
  serviceTypeId: string;
  lessons: number;
  zeroLessons: number;
  price: number | null;
  studentName: string;
  studentNumber: number | null;
  hourlyRate: number;
};

type Service = { id: string; name: string; kind: string };

type Overview = {
  fromWeek: string;
  services: Service[];
  rows: Row[];
  summary: { zeroStudents: number; zeroLessons: number; studentsWithoutPrice: number; rowsTotal: number };
};

const rowKey = (r: Row) => `${r.studentId}|${r.serviceTypeId}`;

export default function PricesPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPrice, setBulkPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/students/prices-overview");
    if (res.ok) {
      setData(await res.json());
      setEdits({});
      setSelected(new Set());
    } else {
      setError("Не удалось загрузить цены");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const serviceName = useMemo(() => {
    const map = new Map((data?.services ?? []).map((s) => [s.id, s.name]));
    return (id: string) => map.get(id) ?? "—";
  }, [data]);

  // Подсказка «у большинства столько»: самая частая цена по этой услуге
  const commonPrice = useMemo(() => {
    const byService = new Map<string, Map<number, number>>();
    for (const r of data?.rows ?? []) {
      if (!r.price) continue;
      const counts = byService.get(r.serviceTypeId) ?? new Map<number, number>();
      counts.set(r.price, (counts.get(r.price) ?? 0) + 1);
      byService.set(r.serviceTypeId, counts);
    }
    return (serviceTypeId: string) => {
      const counts = byService.get(serviceTypeId);
      if (!counts) return null;
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    };
  }, [data]);

  const visibleRows = useMemo(() => {
    const rows = data?.rows ?? [];
    return onlyMissing ? rows.filter((r) => r.price === null) : rows;
  }, [data, onlyMissing]);

  const changed = useMemo(() => {
    const out: { studentId: string; serviceTypeId: string; price: number }[] = [];
    for (const r of data?.rows ?? []) {
      const raw = edits[rowKey(r)];
      if (raw === undefined) continue;
      const value = Number.parseInt(raw, 10) || 0;
      if (value === (r.price ?? 0)) continue;
      out.push({ studentId: r.studentId, serviceTypeId: r.serviceTypeId, price: value });
    }
    return out;
  }, [data, edits]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const applyBulk = () => {
    const value = bulkPrice.trim();
    if (!value || selected.size === 0) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const key of selected) next[key] = value;
      return next;
    });
  };

  const save = async () => {
    if (changed.length === 0) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/students/prices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: changed }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(result?.error ?? "Не удалось сохранить");
        return;
      }
      setToast(
        `Сохранено цен: ${result.saved ?? 0}${result.removed ? `, убрано: ${result.removed}` : ""}`,
      );
      await load();
    } finally {
      setSaving(false);
    }
  };

  const summary = data?.summary;

  return (
    <div className="p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Цены детей</h1>
        {changed.length > 0 && (
          <Button onClick={save} disabled={saving}>
            {saving ? "Сохраняю…" : `Сохранить (${changed.length})`}
          </Button>
        )}
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Красным — занятия, у которых цену взять неоткуда: они дадут ноль в зарплате
        и счёте родителям. Считаем по расписанию с недели {data?.fromWeek ?? "—"}.
      </p>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {toast && (
        <div className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">{toast}</div>
      )}

      {summary && (
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="rounded-lg border-2 border-red-200 bg-red-50 px-4 py-3">
            <div className="text-2xl font-bold tabular-nums text-red-700">{summary.zeroLessons}</div>
            <div className="text-xs text-red-700">занятий посчитаются нулём</div>
          </div>
          <div className="rounded-lg border bg-white px-4 py-3">
            <div className="text-2xl font-bold tabular-nums">{summary.zeroStudents}</div>
            <div className="text-xs text-gray-500">детей, у кого цену взять неоткуда</div>
          </div>
          <div className="rounded-lg border bg-white px-4 py-3">
            <div className="text-2xl font-bold tabular-nums">{summary.studentsWithoutPrice}</div>
            <div className="text-xs text-gray-500">детей без цены в матрице</div>
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant={onlyMissing ? "default" : "outline"} size="sm" onClick={() => setOnlyMissing(true)}>
          Только без цены
        </Button>
        <Button variant={onlyMissing ? "outline" : "default"} size="sm" onClick={() => setOnlyMissing(false)}>
          Все
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {selected.size > 0 ? `Выбрано: ${selected.size}` : "Отметьте строки для общей цены"}
          </span>
          <input
            className="h-9 w-28 rounded-md border px-3 text-sm tabular-nums"
            placeholder="Цена ₸"
            inputMode="numeric"
            value={bulkPrice}
            onChange={(e) => setBulkPrice(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && applyBulk()}
          />
          <Button size="sm" variant="outline" onClick={applyBulk} disabled={!bulkPrice || selected.size === 0}>
            Поставить выбранным
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-500">Загрузка…</div>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-lg border bg-white py-12 text-center text-gray-500">
          {onlyMissing ? "Цены проставлены всем — пусто здесь это хорошо." : "Занятий пока нет."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-600">
              <tr>
                <th className="w-10 p-3">
                  <input
                    type="checkbox"
                    aria-label="Выбрать все"
                    checked={visibleRows.length > 0 && visibleRows.every((r) => selected.has(rowKey(r)))}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(visibleRows.map(rowKey)) : new Set())
                    }
                  />
                </th>
                <th className="p-3">Ребёнок</th>
                <th className="p-3">Услуга</th>
                <th className="p-3 text-right">Занятий</th>
                <th className="p-3">Цена за занятие</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => {
                const key = rowKey(r);
                const value = edits[key] ?? (r.price != null ? String(r.price) : "");
                const hint = commonPrice(r.serviceTypeId);
                const isChanged = changed.some((c) => c.studentId === r.studentId && c.serviceTypeId === r.serviceTypeId);
                return (
                  <tr key={key} className={`border-t ${isChanged ? "bg-blue-50/60" : ""}`}>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`Выбрать ${r.studentName}`}
                        checked={selected.has(key)}
                        onChange={() => toggle(key)}
                      />
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{r.studentName}</div>
                      <div className="text-xs text-gray-400 tabular-nums">
                        {r.studentNumber != null ? `#${String(r.studentNumber).padStart(3, "0")}` : "без номера"}
                      </div>
                    </td>
                    <td className="p-3">{serviceName(r.serviceTypeId)}</td>
                    <td className="p-3 text-right tabular-nums text-gray-600">
                      {r.lessons}
                      {r.zeroLessons > 0 && (
                        <div className="text-xs font-medium text-red-600">{r.zeroLessons} в ноль</div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <input
                          className={`h-9 w-32 rounded-md border px-3 text-sm tabular-nums ${
                            r.price == null && !edits[key] ? "border-red-300 bg-red-50" : ""
                          }`}
                          inputMode="numeric"
                          placeholder={hint ? `${hint}` : "₸"}
                          value={value}
                          onChange={(e) =>
                            setEdits((prev) => ({ ...prev, [key]: e.target.value.replace(/\D/g, "") }))
                          }
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            const inputs = Array.from(
                              document.querySelectorAll<HTMLInputElement>("table input[inputmode='numeric']"),
                            );
                            const next = inputs[inputs.indexOf(e.currentTarget) + 1];
                            next?.focus();
                            next?.select();
                          }}
                        />
                        {hint && !value && (
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                            onClick={() => setEdits((prev) => ({ ...prev, [key]: String(hint) }))}
                          >
                            как у большинства
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
