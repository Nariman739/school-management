"use client";

import { useEffect, useState } from "react";

export default function LoginPage() {
  const [csrfToken, setCsrfToken] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/auth/csrf")
      .then((r) => r.json())
      .then((data) => setCsrfToken(data.csrfToken));

    // Проверяем если вернулись с ошибкой
    if (window.location.search.includes("error")) {
      setError(true);
    }
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#f9fafb" }}>
      <div style={{ width: "100%", maxWidth: 400, background: "white", borderRadius: 12, padding: 32, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <h1 style={{ textAlign: "center", fontSize: 24, fontWeight: "bold", marginBottom: 4 }}>Вход в систему</h1>
        <p style={{ textAlign: "center", color: "#6b7280", fontSize: 14, marginBottom: 24 }}>
          Система управления образовательным центром
        </p>

        <form method="POST" action="/api/auth/callback/credentials">
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <input type="hidden" name="callbackUrl" value="/" />

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Email</label>
            <input
              name="email"
              type="email"
              required
              placeholder="admin@school.kz"
              autoComplete="email"
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Пароль</label>
            <input
              name="password"
              type="password"
              required
              placeholder="Введите пароль"
              autoComplete="current-password"
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }}
            />
          </div>

          {error && (
            <div style={{ background: "#fef2f2", color: "#dc2626", padding: 12, borderRadius: 6, fontSize: 14, marginBottom: 16 }}>
              Неверный email или пароль
            </div>
          )}

          <button
            type="submit"
            style={{ width: "100%", padding: "10px 0", background: "#171717", color: "white", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: "pointer" }}
          >
            Войти
          </button>
        </form>
      </div>
    </div>
  );
}
