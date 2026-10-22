"use client";

import { ArrowRight, CalendarDays, Search, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AppointmentDto, PatientDto } from "@nutreitor/shared";

import { Alert, Card, EmptyState, SectionHeading, buttonClass } from "@/components/ui";
import { MyEfficiency } from "@/components/efficiency";
import { api } from "@/lib/api";
import { fmtTime } from "@/lib/datetime";

const DAY_MS = 24 * 3600 * 1000;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Inicio del profesional: lo que necesita al abrir la app. Turnos de HOY primero
 * (con acceso directo a la ficha), los próximos días después, y sus pacientes como
 * atajo. La lista completa de pacientes vive en /pro/patients.
 */
export function ProToday() {
  const router = useRouter();
  const [appts, setAppts] = useState<AppointmentDto[] | null>(null);
  const [patients, setPatients] = useState<PatientDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const from = startOfToday();
    const to = new Date(from.getTime() + 8 * DAY_MS);
    api<AppointmentDto[]>(
      `scheduling/appointments?from=${from.toISOString()}&to=${to.toISOString()}`,
    )
      .then((a) => setAppts(a.filter((x) => x.status === "booked")))
      .catch(() => setError("No pudimos cargar tus turnos."));
    api<PatientDto[]>("patients")
      .then(setPatients)
      .catch(() => setError("No pudimos cargar tus pacientes."));
  }, []);

  const tomorrow = new Date(startOfToday().getTime() + DAY_MS);
  const today = appts?.filter((a) => new Date(a.startsAt) < tomorrow) ?? [];
  const upcoming = appts?.filter((a) => new Date(a.startsAt) >= tomorrow).slice(0, 5) ?? [];
  const active = patients?.filter((p) => !p.archived) ?? [];

  return (
    <div className="space-y-6">
      {error && <Alert>{error}</Alert>}

      <MyEfficiency />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <SectionHeading>Turnos de hoy</SectionHeading>
            <Link href="/pro/agenda" className="text-sm text-brand hover:underline">
              Ver agenda
            </Link>
          </div>
          {appts === null ? (
            <Skeleton rows={2} />
          ) : today.length === 0 ? (
            <EmptyState>No tenés turnos hoy.</EmptyState>
          ) : (
            <ul className="divide-y divide-stone-100">
              {today.map((a) => (
                <AppointmentRow key={a.id} appt={a} />
              ))}
            </ul>
          )}

          {upcoming.length > 0 && (
            <>
              <SectionHeading className="mb-2 mt-6">Próximos días</SectionHeading>
              <ul className="divide-y divide-stone-100">
                {upcoming.map((a) => (
                  <AppointmentRow key={a.id} appt={a} withDay />
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card>
          <SectionHeading className="mb-4">Tus pacientes</SectionHeading>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/pro/patients${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
            }}
            className="relative mb-4"
          >
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-stone-500" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar paciente"
              aria-label="Buscar paciente"
              className="w-full rounded-lg border border-stone-200 bg-surface py-2 pl-9 pr-3 text-sm outline-none placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </form>
          {patients === null ? (
            <Skeleton rows={3} />
          ) : active.length === 0 ? (
            <EmptyState>Todavía no tenés pacientes asignados.</EmptyState>
          ) : (
            <>
              <p className="mb-3 flex items-center gap-2 text-sm text-stone-600">
                <Users className="h-4 w-4 text-stone-500" aria-hidden />
                {active.length} {active.length === 1 ? "paciente a cargo" : "pacientes a cargo"}
              </p>
              <ul className="space-y-1">
                {active.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/pro/patients/${p.id}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-stone-50"
                    >
                      <Avatar name={p.fullName} />
                      <span className="truncate text-sm text-stone-800">{p.fullName}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href="/pro/patients"
                className={buttonClass("secondary", "sm", "mt-4 w-full")}
              >
                Ver todos <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function AppointmentRow({ appt, withDay }: { appt: AppointmentDto; withDay?: boolean }) {
  return (
    <li>
      <Link
        href={`/pro/patients/${appt.patientId}`}
        className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-3 transition hover:bg-stone-50"
      >
        <div className="w-24 shrink-0">
          {withDay && (
            <p className="text-xs text-stone-500">{fmtDayShort(appt.startsAt)}</p>
          )}
          <p className="font-medium tabular-nums text-stone-900">{fmtTime(appt.startsAt)}</p>
        </div>
        <Avatar name={appt.patientName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-stone-800">{appt.patientName}</p>
          <p className="flex items-center gap-1 text-xs text-stone-500">
            <CalendarDays className="h-3 w-3" aria-hidden />
            {appt.durationMinutes} min
            {appt.bookedVia === "public" && " · primera consulta (reservó online)"}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
      </Link>
    </li>
  );
}

/** "mié 5 mar": entra en la columna de la hora. */
const fmtDayShort = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });

function Avatar({ name }: { name: string }) {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-stone-100" />
      ))}
    </div>
  );
}
