"use client";

import type { ReactNode } from "react";
import type { MembershipRole } from "@nutreitor/shared";

const ROLE_LABEL: Record<MembershipRole, string> = {
  admin: "Administración",
  professional: "Profesional",
  patient: "Paciente",
};

/** Layout base de un destino autenticado: topbar con org + rol + logout. */
export function WorkspaceShell({
  orgName,
  role,
  children,
}: {
  orgName: string;
  role: MembershipRole;
  children: ReactNode;
}) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.assign("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand shadow-[0_0_12px_rgb(var(--brand-rgb))]" />
            <span className="font-semibold tracking-tight">{orgName}</span>
            <span className="ml-2 rounded-full border border-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
              {ROLE_LABEL[role]}
            </span>
          </div>
          <button
            onClick={logout}
            className="text-sm text-zinc-500 transition hover:text-zinc-200"
          >
            Salir
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
