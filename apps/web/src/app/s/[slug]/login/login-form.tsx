"use client";

import { useState } from "react";

/**
 * Formulario de login (client). POST /api/auth/login vía el proxy → la API valida
 * dentro del tenant (slug del subdominio) y setea las cookies httpOnly. En éxito,
 * navega al destino por rol que devuelve la API.
 */
export function LoginForm({ initialEmail }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (r.status === 403) {
        // Org rechazada o suspendida: el motivo viene de la API.
        const d = (await r.json().catch(() => ({}))) as { message?: string };
        setError(d.message ?? "Esta organización no está habilitada.");
        return;
      }
      if (!r.ok) {
        setError(
          r.status === 401
            ? "Credenciales inválidas."
            : r.status === 429
              ? "Demasiados intentos. Esperá unos minutos y volvé a probar."
              : `Error (${r.status})`,
        );
        return;
      }
      const data = (await r.json()) as { redirect: string };
      window.location.assign(data.redirect);
    } catch {
      setError("No se pudo conectar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="login-email" className="mb-1 block text-sm text-stone-600">Email</label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
          className="w-full rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20"
          placeholder="vos@organizacion.com"
        />
      </div>
      <div>
        <label htmlFor="login-password" className="mb-1 block text-sm text-stone-600">Contraseña</label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-brand-fg transition hover:brightness-110 disabled:opacity-50"
      >
        {loading ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
