"use client";

import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  Globe,
  Home,
  LayoutDashboard,
  MessageSquare,
  Settings,
  ShoppingCart,
  Sun,
  UserRound,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MembershipRole } from "@nutreitor/shared";

import { useUnreadMessages } from "@/components/messages/use-unread";
import { FeedbackProvider } from "@/components/ui";

const ROLE_LABEL: Record<MembershipRole, string> = {
  admin: "Administración",
  professional: "Profesional",
  patient: "Paciente",
};

/** `unread`: el ítem muestra el contador de mensajes sin leer. */
type NavItem = { href: string; label: string; icon: LucideIcon; unread?: boolean };

const NAV: Record<MembershipRole, NavItem[]> = {
  admin: [
    { href: "/admin", label: "Resumen", icon: LayoutDashboard },
    { href: "/admin/patients", label: "Pacientes", icon: Users },
    { href: "/admin/messages", label: "Mensajes", icon: MessageSquare, unread: true },
    { href: "/admin/members", label: "Miembros", icon: UsersRound },
    { href: "/pro/agenda", label: "Mi agenda", icon: CalendarDays },
    { href: "/pro/profile", label: "Mi perfil", icon: UserRound },
    { href: "/admin/public", label: "Página pública", icon: Globe },
    { href: "/admin/settings", label: "Configuración", icon: Settings },
  ],
  professional: [
    { href: "/pro", label: "Hoy", icon: Sun },
    { href: "/pro/patients", label: "Pacientes", icon: Users },
    { href: "/pro/messages", label: "Mensajes", icon: MessageSquare, unread: true },
    { href: "/pro/agenda", label: "Agenda", icon: CalendarDays },
    { href: "/pro/recipes", label: "Recetas", icon: BookOpen },
    { href: "/pro/profile", label: "Mi perfil", icon: UserRound },
  ],
  patient: [
    { href: "/app", label: "Inicio", icon: Home },
    { href: "/app/plan", label: "Mi plan", icon: ClipboardList },
    { href: "/app/compras", label: "Compras", icon: ShoppingCart },
    { href: "/app/mensajes", label: "Mensajes", icon: MessageSquare, unread: true },
  ],
};

/**
 * Ítem activo = el de ruta MÁS LARGA que coincide con la actual. Con startsWith
 * suelto, "/pro" quedaba activo junto con "/pro/agenda"; así sólo gana el más
 * específico, y una subruta sin ítem propio (la ficha) marca a su sección padre.
 */
function activeHref(items: NavItem[], pathname: string): string | null {
  const matches = items.filter(
    (i) => pathname === i.href || pathname.startsWith(`${i.href}/`),
  );
  return matches.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}

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
  const items = NAV[role];
  const current = activeHref(items, pathname);
  const unread = useUnreadMessages(role);
  // En celular las secciones son una fila con scroll: que la activa quede a la vista.
  const mobileNavRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mobileNavRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    // `unread`: el contador ensancha el ítem cuando llega, después del primer scroll.
  }, [current, unread]);

  return (
    <div className="flex min-h-screen">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-lg bg-white px-4 py-2 text-sm shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Saltar al contenido
      </a>
      <aside className="hidden w-56 shrink-0 print:!hidden flex-col border-r border-stone-200 bg-white px-4 py-5 sm:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand shadow-[0_0_12px_rgb(var(--brand-rgb))]" />
          <span className="truncate text-sm font-semibold tracking-tight">{orgName}</span>
        </div>
        <nav aria-label="Secciones" className="flex flex-1 flex-col gap-1">
          {items.map((item) => {
            const active = item.href === current;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition " +
                  (active
                    ? "bg-brand/15 font-medium text-brand"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-900")
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
                {item.unread && <UnreadBadge count={unread} />}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* min-w-0: sin esto la columna toma el ancho mínimo de su contenido (una
          tabla con scroll propio) y en celulares la página entera se desborda. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar persistente (todos los tamaños): org (solo mobile) + menú de usuario. */}
        <header className="sticky top-0 z-20 flex print:hidden items-center justify-between border-b border-stone-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
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
        {items.length > 1 && (
          <nav
            ref={mobileNavRef}
            aria-label="Secciones"
            className="flex gap-1 overflow-x-auto border-b border-stone-200 bg-white px-4 py-2 sm:hidden print:hidden"
          >
            {items.map((item) => {
              const active = item.href === current;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm transition " +
                    (active
                      ? "bg-brand/15 font-medium text-brand"
                      : "text-stone-600 hover:bg-stone-100")
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {item.label}
                  {item.unread && <UnreadBadge count={unread} />}
                </Link>
              );
            })}
          </nav>
        )}

        <main id="contenido" className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 print:max-w-none print:p-0">
          <FeedbackProvider>{children}</FeedbackProvider>
        </main>
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
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-stone-500" aria-hidden>
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

function UnreadBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span
      className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-medium text-brand-fg"
      aria-label={`${count} sin leer`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
