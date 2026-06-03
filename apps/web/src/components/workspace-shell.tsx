"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { MembershipRole } from "@nutreitor/shared";

const ROLE_LABEL: Record<MembershipRole, string> = {
  admin: "Administración",
  professional: "Profesional",
  patient: "Paciente",
};

const NAV: Record<MembershipRole, { href: string; label: string }[]> = {
  admin: [
    { href: "/admin", label: "Resumen" },
    { href: "/admin/members", label: "Miembros" },
    { href: "/admin/settings", label: "Configuración" },
  ],
  professional: [{ href: "/pro", label: "Pacientes" }],
  patient: [{ href: "/app", label: "Inicio" }],
};

/**
 * Layout base de un destino autenticado: sidebar de navegación por rol + topbar
 * con org/rol/logout. Densidad de herramienta de gestión; el acento usa el color
 * de marca del tenant (`brand`, vía CSS var inyectada por el layout).
 */
export function WorkspaceShell({
  orgName,
  role,
  children,
}: {
  orgName: string;
  role: MembershipRole;
  children: ReactNode;
}) {
  const pathname = usePathname();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.assign("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-zinc-900 bg-zinc-950 px-4 py-5 sm:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand shadow-[0_0_12px_rgb(var(--brand-rgb))]" />
          <span className="truncate text-sm font-semibold tracking-tight">{orgName}</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV[role].map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "rounded-lg px-3 py-2 text-sm transition " +
                  (active
                    ? "bg-brand/15 text-brand"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100")
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 border-t border-zinc-900 pt-4">
          <span className="block px-3 text-[11px] uppercase tracking-wide text-zinc-600">
            {ROLE_LABEL[role]}
          </span>
          <button
            onClick={logout}
            className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100"
          >
            Salir
          </button>
        </div>
      </aside>

      <div className="flex-1">
        {/* Topbar (mobile-friendly: muestra org + salir) */}
        <header className="flex items-center justify-between border-b border-zinc-900 px-6 py-3 sm:hidden">
          <span className="text-sm font-semibold">{orgName}</span>
          <button onClick={logout} className="text-sm text-zinc-400">
            Salir
          </button>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
