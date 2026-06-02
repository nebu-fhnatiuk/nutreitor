"use client";

import { useState } from "react";

/**
 * Formulario de login (client). POST /api/auth/login vía el proxy → la API valida
 * dentro del tenant (slug del subdominio) y setea las cookies httpOnly. En éxito,
 * navega al destino por rol que devuelve la API.
 */
export function LoginForm() {
  const [email, setEmail] = useState("");
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
      if (!r.ok) {
        setError(r.status === 401 ? "Credenciales inválidas." : `Error (${r.status})`);
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
        <label className="mb-1 block text-sm text-zinc-400">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none transition placeholder:text-zinc-600 focus:border-brand/60"
          placeholder="vos@organizacion.com"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-zinc-400">Contraseña</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none transition placeholder:text-zinc-600 focus:border-brand/60"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-2.5 text-sm text-red-300">
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
