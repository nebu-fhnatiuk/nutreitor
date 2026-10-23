"use client";

import { useEffect, useState } from "react";

import { AuthButton, AuthField, AuthLink, AuthNotice, PasswordField } from "@/components/auth/auth-shell";

/** "4:32" */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * Formulario de login (client). POST /api/auth/login vía el proxy → la API valida
 * dentro del tenant (slug del subdominio) y setea las cookies httpOnly. En éxito,
 * navega al destino por rol que devuelve la API. Con 429 muestra cuánto falta
 * (`Retry-After`) y no deja reintentar hasta entonces.
 */
export function LoginForm({ initialEmail }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ title: string; detail?: string } | null>(null);
  const [waitUntil, setWaitUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const left = waitUntil ? Math.max(0, Math.ceil((waitUntil - now) / 1000)) : 0;
  const showError = !!error && left === 0;
  useEffect(() => {
    if (!waitUntil) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [waitUntil]);
  useEffect(() => {
    if (waitUntil && left === 0) setWaitUntil(null);
  }, [waitUntil, left]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (left > 0) return;
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
        setError({ title: d.message ?? "Esta organización no está habilitada." });
        return;
      }
      if (r.status === 429) {
        const sec = Number(r.headers.get("retry-after")) || 60;
        setNow(Date.now());
        setWaitUntil(Date.now() + sec * 1000);
        setError(null);
        return;
      }
      if (!r.ok) {
        setError(
          r.status === 401
            ? { title: "El email o la contraseña no coinciden.", detail: "Revisá que el email sea el que usás en este espacio." }
            : { title: `No pudimos ingresar (error ${r.status}).`, detail: "Probá de nuevo en un rato." },
        );
        return;
      }
      const data = (await r.json()) as { redirect: string };
      window.location.assign(data.redirect);
    } catch {
      setError({ title: "No se pudo conectar.", detail: "Revisá la señal y probá de nuevo." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {left > 0 && (
        <AuthNotice zone="warn" title="Demasiados intentos.">
          Probá de nuevo en{" "}
          <span className="font-display text-[17px] font-bold tabular-nums text-stone-900" aria-live="off">
            {clock(left)}
          </span>
          . <AuthLink href="/olvide" className="min-h-0">Restablecer la contraseña</AuthLink>
        </AuthNotice>
      )}
      {showError && <AuthNotice zone="bad" title={error!.title}>{error!.detail}</AuthNotice>}
      <AuthField
        label="Email"
        type="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="username"
        required
        placeholder="vos@club.com"
        aria-invalid={showError ? true : undefined}
      />
      <PasswordField
        label="Contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
        placeholder="Tu contraseña"
        aria-invalid={showError ? true : undefined}
      />
      <AuthButton type="submit" disabled={loading || left > 0} className="!mt-6">
        {loading ? "Ingresando…" : left > 0 ? "Esperá un momento" : "Ingresar"}
      </AuthButton>
      <p className="text-center">
        <AuthLink href="/olvide">¿Olvidaste tu contraseña?</AuthLink>
      </p>
    </form>
  );
}
