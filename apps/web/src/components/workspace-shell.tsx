"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { MembershipRole } from "@nutreitor/shared";

const ROLE_LABEL: Record<MembershipRole, string> = {
  admin: "Administración",
  professional: "Profesional",
  patient: "Paciente",
};

const NAV: Record<MembershipRole, { href: string; label: string }[]> = {
  admin: [
    { href: "/admin", label: "Resumen" },
    { href: "/admin/patients", label: "Pacientes" },
    { href: "/admin/members", label: "Miembros" },
    { href: "/admin/public", label: "Página pública" },
    { href: "/admin/settings", label: "Configuración" },
  ],
  professional: [
    { href: "/pro", label: "Pacientes" },
    { href: "/pro/agenda", label: "Agenda" },
    { href: "/pro/profile", label: "Mi perfil" },
  ],
  patient: [{ href: "/app", label: "Inicio" }],
};

/**
 * Layout base de un destino autenticado: sidebar de navegación por rol + topbar
 * persistente con un menú de usuario (quién sos + cerrar sesión) arriba a la
 * derecha. El acento usa el color de marca del tenant (`brand`, vía CSS var).
 */
export function WorkspaceShell({
  orgName,
  role,
  userName,
  children,
}: {
  orgName: string;
  role: MembershipRole;
  userName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-stone-200 bg-white px-4 py-5 sm:flex">
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
                    : "text-stone-500 hover:bg-stone-100 hover:text-stone-900")
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        {/* Topbar persistente (todos los tamaños): org (solo mobile) + menú de usuario. */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-stone-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 sm:hidden">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand" />
            <span className="truncate text-sm font-semibold">{orgName}</span>
          </div>
          {/* En desktop la org vive en el sidebar; este spacer empuja el menú a la derecha. */}
          <div className="hidden sm:block" />
          <UserMenu userName={userName} role={role} />
        </header>

        {/* Navegación mobile: en celular el sidebar está oculto, así que las
            secciones viven en una fila de tabs scrolleable bajo el topbar. */}
        {NAV[role].length > 1 && (
          <nav className="flex gap-1 overflow-x-auto border-b border-stone-200 bg-white px-4 py-2 sm:hidden">
            {NAV[role].map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    "shrink-0 rounded-full px-3 py-1.5 text-sm transition " +
                    (active
                      ? "bg-brand/15 text-brand"
                      : "text-stone-500 hover:bg-stone-100")
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}

        <main className="mx-auto w-full max-w-5xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}

/** Menú de cuenta: avatar + nombre → desplegable con rol y "Cerrar sesión". */
function UserMenu({ userName, role }: { userName: string; role: MembershipRole }) {
  const [open, setOpen] = useState(false);
  const initial = userName.trim().charAt(0).toUpperCase() || "?";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.assign("/login");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-stone-200 py-1 pl-1 pr-2.5 transition hover:border-stone-300"
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-fg">
          {initial}
        </span>
        <span className="hidden max-w-[10rem] truncate text-sm text-stone-700 sm:block">
          {userName}
        </span>
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-stone-400" aria-hidden>
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop: cierra el menú al hacer click afuera. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            role="menu"
            className="absolute right-0 z-20 mt-2 w-60 rounded-xl border border-stone-200 bg-white p-1.5 shadow-lg"
          >
            <div className="px-3 py-2">
              <p className="truncate text-sm font-medium text-stone-900">{userName}</p>
              <p className="text-xs text-stone-500">{ROLE_LABEL[role]}</p>
            </div>
            <div className="my-1 border-t border-stone-100" />
            <button
              type="button"
              role="menuitem"
              onClick={logout}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                <path
                  d="M6 2H3.5A1.5 1.5 0 002 3.5v9A1.5 1.5 0 003.5 14H6M10 11l3-3-3-3M13 8H6"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Cerrar sesión
            </button>
          </div>
        </>
      )}
    </div>
  );
}
