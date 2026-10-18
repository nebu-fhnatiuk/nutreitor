"use client";

import { ArrowRight, CalendarDays, Globe, MailWarning, Settings, UserX, Users, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { AppointmentDto, InvitationDto, MemberDto, PatientDto } from "@nutreitor/shared";

import { Alert, Card, EmptyState, SectionHeading, cn } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDayLong, fmtTime, groupByDay } from "@/lib/datetime";

const DAY_MS = 24 * 3600 * 1000;

/**
 * Inicio del admin: el estado de la organización de un vistazo y lo que pide acción
 * (pacientes sin profesional, invitaciones sin aceptar). Antes era una grilla de
 * links sin ningún dato.
 */
export function AdminOverview() {
  const [patients, setPatients] = useState<PatientDto[] | null>(null);
  const [members, setMembers] = useState<MemberDto[] | null>(null);
  const [invites, setInvites] = useState<InvitationDto[] | null>(null);
  const [appts, setAppts] = useState<AppointmentDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fail = () => setError("No pudimos cargar parte del resumen.");
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + 7 * DAY_MS);
    api<PatientDto[]>("patients").then(setPatients).catch(fail);
    api<MemberDto[]>("members").then(setMembers).catch(fail);
    api<InvitationDto[]>("invitations").then(setInvites).catch(fail);
    api<AppointmentDto[]>(`scheduling/appointments?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then((a) => setAppts(a.filter((x) => x.status === "booked")))
      .catch(fail);
  }, []);

  const activePatients = patients?.filter((p) => !p.archived) ?? [];
  const unassigned = activePatients.filter((p) => p.activeProfessionals.length === 0);
  const professionals = members?.filter((m) => m.status === "active" && m.role !== "patient") ?? [];
  const pending = invites?.filter((i) => i.status === "pending" || i.status === "expired") ?? [];

  return (
    <div className="space-y-6">
      {error && <Alert>{error}</Alert>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Users} label="Pacientes activos" value={patients && activePatients.length} href="/admin/patients" />
        <Stat
          icon={UserX}
          label="Sin profesional"
          value={patients && unassigned.length}
          href="/admin/patients"
          attention={unassigned.length > 0}
        />
        <Stat icon={UsersRound} label="En el equipo" value={members && professionals.length} href="/admin/members" />
        <Stat icon={CalendarDays} label="Turnos esta semana" value={appts && appts.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionHeading className="mb-3">Para resolver</SectionHeading>
          {patients === null || invites === null ? (
            <Skeleton />
          ) : unassigned.length === 0 && pending.length === 0 ? (
            <EmptyState>Nada pendiente: todos los pacientes tienen profesional y no hay invitaciones colgadas.</EmptyState>
          ) : (
            <ul className="space-y-1">
              {unassigned.slice(0, 5).map((p) => (
                <ActionRow
                  key={p.id}
                  href={`/admin/patients/${p.id}?tab=ficha`}
                  icon={UserX}
                  title={p.fullName}
                  detail="Sin profesional asignado"
                />
              ))}
              {unassigned.length > 5 && (
                <li className="px-2 text-xs text-stone-500">y {unassigned.length - 5} pacientes más sin profesional</li>
              )}
              {pending.slice(0, 5).map((i) => (
                <ActionRow
                  key={i.id}
                  href="/admin/members"
                  icon={MailWarning}
                  title={i.email}
                  detail={i.status === "expired" ? "Invitación vencida: reenviala" : "Invitación sin aceptar"}
                />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionHeading className="mb-3">Turnos de la semana</SectionHeading>
          {appts === null ? (
            <Skeleton />
          ) : appts.length === 0 ? (
            <EmptyState>No hay turnos reservados para los próximos 7 días.</EmptyState>
          ) : (
            <div className="space-y-3">
              {groupByDay(appts)
                .slice(0, 4)
                .map(([k, day]) => (
                  <div key={k}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-stone-500">
                      {fmtDayLong(day[0]!.startsAt)}
                    </p>
                    <ul className="space-y-0.5 text-sm">
                      {day.map((a) => (
                        <li key={a.id} className="flex gap-3">
                          <span className="w-12 shrink-0 tabular-nums text-stone-900">{fmtTime(a.startsAt)}</span>
                          <span className="truncate text-stone-700">
                            {a.patientName} <span className="text-stone-500">con {a.professionalName}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <SectionHeading className="mb-3">Configuración de la organización</SectionHeading>
        <div className="grid gap-2 sm:grid-cols-3">
          <QuickLink href="/admin/members" icon={UsersRound}>
            Invitar y gestionar miembros
          </QuickLink>
          <QuickLink href="/admin/public" icon={Globe}>
            Página pública y roster
          </QuickLink>
          <QuickLink href="/admin/settings" icon={Settings}>
            Marca y complementos
          </QuickLink>
        </div>
      </Card>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  href,
  attention,
}: {
  icon: typeof Users;
  label: string;
  value: number | null;
  href?: string;
  attention?: boolean;
}) {
  const body = (
    <>
      <Icon className={cn("h-4 w-4", attention ? "text-amber-700" : "text-stone-500")} aria-hidden />
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", attention ? "text-amber-800" : "text-stone-900")}>
        {value === null ? <span className="inline-block h-7 w-10 animate-pulse rounded bg-stone-100" /> : value}
      </p>
      <p className="text-sm text-stone-600">{label}</p>
    </>
  );
  const cls = cn(
    "block rounded-2xl border bg-white p-4 shadow-sm transition",
    attention ? "border-amber-200 bg-amber-50" : "border-stone-200",
    href && "hover:border-brand/40",
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function ActionRow({
  href,
  icon: Icon,
  title,
  detail,
}: {
  href: string;
  icon: typeof Users;
  title: string;
  detail: string;
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-stone-50">
        <Icon className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-stone-800">{title}</span>
          <span className="block text-xs text-stone-500">{detail}</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
      </Link>
    </li>
  );
}

function QuickLink({ href, icon: Icon, children }: { href: string; icon: typeof Users; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center gap-3 rounded-lg border border-stone-200 px-3 text-sm text-stone-700 transition hover:border-brand/40 hover:text-brand"
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {children}
    </Link>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-9 animate-pulse rounded-lg bg-stone-100" />
      ))}
    </div>
  );
}
