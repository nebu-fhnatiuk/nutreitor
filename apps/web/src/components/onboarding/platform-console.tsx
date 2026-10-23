"use client";

import { LogOut } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type {
  LeadStatus,
  LicenseStatus,
  OrgDecisionDto,
  OrgStatus,
  PlatformLicenseEntry,
  PlatformMe,
  PlatformOrgEntry,
  SalesLeadDto,
} from "@nutreitor/shared";
import {
  LEAD_ORG_KIND_LABEL,
  LEAD_ROLE_LABEL,
  LEAD_SIZE_LABEL,
  LEAD_STATUS_LABEL,
  formatLicense,
} from "@nutreitor/shared";

import {
  AuthButton,
  AuthField,
  AuthHeading,
  AuthLink,
  AuthNotice,
  AuthShell,
  PasswordField,
} from "@/components/auth/auth-shell";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  FeedbackProvider,
  Label,
  Loading,
  Modal,
  Tabs,
  Textarea,
  ThemeToggle,
  ZoneMark,
  cn,
  tabPanelProps,
  useFeedback,
  zoneSoft,
  zoneText,
  type Zone,
} from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";

type Tab = "pending_review" | "active" | "closed" | "licenses" | "leads";

const STATUS_LABEL: Record<OrgStatus, string> = {
  pending_review: "En revisión",
  active: "Activa",
  rejected: "Rechazada",
  suspended: "Suspendida",
};

const LICENSE_LABEL: Record<LicenseStatus, string> = {
  missing: "Sin matrícula",
  declared: "Por revisar",
  reviewed: "Revisada",
  rejected: "Rechazada",
};

/** Estados como zonas del tema Estadio (forma + color); `null` = neutro. */
const ORG_ZONE: Record<OrgStatus, Zone | null> = {
  pending_review: "warn",
  active: "ok",
  rejected: "bad",
  suspended: "bad",
};

const LICENSE_ZONE: Record<LicenseStatus, Zone | null> = {
  missing: null,
  declared: "warn",
  reviewed: "ok",
  rejected: "bad",
};

/** Chip de estado: rótulo condensado y la forma de la zona (nunca sólo color). */
function StatusChip({ zone, children }: { zone: Zone | null; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 font-display text-xs font-semibold uppercase tracking-wider",
        zone ? cn(zoneText[zone], zoneSoft[zone]) : "bg-stone-100 text-stone-600",
      )}
    >
      {zone && <ZoneMark zone={zone} />}
      {children}
    </span>
  );
}

/**
 * Consola de plataforma (dominio raíz, ADR 0025): aprobar organizaciones y revisar
 * matrículas, y seguir las consultas de clubes. Sesión propia, separada de la de los tenants.
 */
export function PlatformConsole() {
  const [me, setMe] = useState<PlatformMe | null | undefined>(undefined);

  useEffect(() => {
    api<PlatformMe>("platform/auth/me")
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  if (me === undefined) {
    return (
      <div data-theme="estadio" className="grid min-h-screen place-items-center bg-stone-50">
        <Loading />
      </div>
    );
  }
  if (!me) {
    return (
      <AuthShell>
        <PlatformLogin onDone={setMe} />
      </AuthShell>
    );
  }
  return (
    <ConsoleShell me={me} onLogout={() => setMe(null)}>
      <FeedbackProvider>
        <Console onLogout={() => setMe(null)} />
      </FeedbackProvider>
    </ConsoleShell>
  );
}

/**
 * Marco de la consola (KAN-87): tema Estadio, oscuro por defecto, con la marca de
 * Nutreitor (no hay club). Topbar con quién opera, claro/oscuro y salir.
 */
function ConsoleShell({ me, onLogout, children }: { me: PlatformMe; onLogout: () => void; children: ReactNode }) {
  async function logout() {
    await api("platform/auth/logout", { method: "POST" }).catch(() => undefined);
    onLogout();
  }

  return (
    <div data-theme="estadio" className="min-h-screen bg-stone-50 text-stone-900">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-lg bg-surface px-4 py-2 text-sm shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-brand shadow-[0_0_12px_rgb(var(--brand-rgb))]" />
            <span className="font-display text-lg font-bold uppercase tracking-[0.08em]">Nutreitor</span>
            <span className="hidden font-display text-sm font-semibold uppercase tracking-[0.16em] text-stone-500 sm:inline">· Consola</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="hidden max-w-[16rem] truncate text-sm text-stone-600 md:inline">{me.fullName}</span>
            <ThemeToggle
              menuItem={false}
              className="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
            <button
              type="button"
              onClick={logout}
              className="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Salir
            </button>
          </div>
        </div>
      </header>
      <main id="contenido" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}

function PlatformLogin({ onDone }: { onDone: (me: PlatformMe) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      onDone(
        await api<PlatformMe>("platform/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }),
      );
    } catch (e2) {
      setErr(e2 instanceof ApiError && e2.status === 401 ? "Email o contraseña incorrectos." : errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <AuthHeading kicker="Equipo Nutreitor" title="Consola">
        Altas de organizaciones, matrículas y consultas de clubes. Sólo para quienes operan la plataforma.
      </AuthHeading>
      <div className="space-y-4">
        <AuthField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
          aria-invalid={err ? true : undefined}
        />
        <PasswordField
          label="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          aria-invalid={err ? true : undefined}
        />
      </div>
      {err && <AuthNotice zone="bad" title={err} />}
      <AuthButton type="submit" disabled={busy}>
        {busy ? "Ingresando…" : "Ingresar"}
      </AuthButton>
      <div className="text-center">
        <AuthLink href="/olvide">¿Olvidaste tu contraseña?</AuthLink>
      </div>
    </form>
  );
}

function Console({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("pending_review");
  const [orgs, setOrgs] = useState<PlatformOrgEntry[] | null>(null);
  const [licenses, setLicenses] = useState<PlatformLicenseEntry[] | null>(null);
  const [leads, setLeads] = useState<SalesLeadDto[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, l, c] = await Promise.all([
        api<PlatformOrgEntry[]>("platform/orgs"),
        api<PlatformLicenseEntry[]>("platform/licenses"),
        api<SalesLeadDto[]>("platform/leads"),
      ]);
      setOrgs(o);
      setLicenses(l);
      setLeads(c);
      setErr(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onLogout();
      setErr(errorMessage(e));
    }
  }, [onLogout]);

  useEffect(() => {
    void load();
  }, [load]);

  const byTab = (t: Tab) =>
    (orgs ?? []).filter((o) =>
      t === "closed" ? o.status === "rejected" || o.status === "suspended" : o.status === t,
    );
  const pendingCount = byTab("pending_review").length;
  const newLeads = (leads ?? []).filter((l) => l.status === "new").length;

  return (
    <div>
      <div>
        <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-accent2">Plataforma</p>
        <h1 className="mt-1 font-serif text-4xl sm:text-5xl">Consola de plataforma</h1>
        <p className="mt-2 text-sm text-stone-600">
          Altas de organizaciones, matrículas y consultas de clubes. No muestra datos de deportistas.
        </p>
      </div>

      <div className="mt-6">
        <Tabs<Tab>
          label="Secciones de la consola"
          value={tab}
          onChange={setTab}
          items={[
            { id: "pending_review", label: "En revisión", count: pendingCount, alert: pendingCount > 0 },
            { id: "licenses", label: "Matrículas", count: licenses?.length ?? 0 },
            { id: "leads", label: "Consultas de clubes", count: newLeads, alert: newLeads > 0 },
            { id: "active", label: "Activas", count: byTab("active").length },
            { id: "closed", label: "Rechazadas y suspendidas", count: byTab("closed").length },
          ]}
        />
      </div>

      {err && <div className="mt-4"><Alert>{err}</Alert></div>}

      <div {...tabPanelProps(tab)} className="mt-6">
        {orgs === null ? (
          <Loading />
        ) : tab === "licenses" ? (
          <LicenseQueue entries={licenses ?? []} onChanged={load} />
        ) : tab === "leads" ? (
          <LeadsQueue entries={leads ?? []} onChanged={load} />
        ) : byTab(tab).length === 0 ? (
          <EmptyState>{tab === "pending_review" ? "No hay altas por revisar." : "Nada por acá."}</EmptyState>
        ) : (
          <div className="space-y-4">
            {byTab(tab).map((o) => (
              <OrgCard key={o.id} org={o} onChanged={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const ACTIONS: Record<OrgStatus, { decision: OrgDecisionDto["decision"]; label: string; variant: "primary" | "secondary" | "danger" }[]> = {
  pending_review: [
    { decision: "approve", label: "Aprobar", variant: "primary" },
    { decision: "reject", label: "Rechazar", variant: "danger" },
  ],
  active: [{ decision: "suspend", label: "Suspender", variant: "danger" }],
  suspended: [{ decision: "reactivate", label: "Reactivar", variant: "secondary" }],
  rejected: [{ decision: "approve", label: "Aprobar igual", variant: "secondary" }],
};

function OrgCard({ org, onChanged }: { org: PlatformOrgEntry; onChanged: () => Promise<void> }) {
  const { toast } = useFeedback();
  const [noteFor, setNoteFor] = useState<OrgDecisionDto["decision"] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function decide(decision: OrgDecisionDto["decision"], withNote?: string) {
    setBusy(true);
    setErr(null);
    try {
      await api(`platform/orgs/${org.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withNote ? { decision, note: withNote } : { decision }),
      });
      toast(`${org.name}: ${STATUS_LABEL[decisionTarget(decision)].toLowerCase()}.`);
      setNoteFor(null);
      setNote("");
      await onChanged();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const declared = org.licenses.filter((l) => l.licenseStatus === "declared").length;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-bold uppercase tracking-[0.02em]">{org.name}</h2>
          <p className="mt-0.5 break-all text-sm text-stone-500">
            {org.slug} · {org.kind === "individual" ? "Profesional independiente" : "Equipo"} · registrada el{" "}
            {new Date(org.createdAt).toLocaleDateString("es-AR")}
          </p>
        </div>
        <StatusChip zone={ORG_ZONE[org.status]}>{STATUS_LABEL[org.status]}</StatusChip>
      </div>

      {org.reviewNote && <p className="mt-3 text-sm text-stone-700">Motivo: {org.reviewNote}</p>}

      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-display text-xs font-semibold uppercase tracking-widest text-stone-500">Administración</dt>
          {org.admins.map((a) => (
            <dd key={a.email} className="mt-1 break-all">
              {a.fullName} · <span className="text-stone-600">{a.email}</span>
            </dd>
          ))}
        </div>
        <div>
          <dt className="font-display text-xs font-semibold uppercase tracking-widest text-stone-500">Matrículas</dt>
          {org.licenses.length === 0 && <dd className="mt-1 text-stone-500">Nadie declaró matrícula.</dd>}
          {org.licenses.map((l) => (
            <dd key={l.profileId} className="mt-1 flex flex-wrap items-center gap-2">
              <span>{l.fullName}</span>
              <span className="text-stone-600">{formatLicense(l.licenseNumber, l.licenseJurisdiction) ?? "—"}</span>
              <LicenseBadge status={l.licenseStatus} />
            </dd>
          ))}
        </div>
      </dl>

      {org.status === "pending_review" && declared > 0 && (
        <p className="mt-4 text-xs text-stone-500">
          Aprobar también marca como revisadas las {declared} matrícula(s) declaradas: verificalas antes en el registro correspondiente.
        </p>
      )}

      {err && <div className="mt-3"><Alert>{err}</Alert></div>}

      <div className="mt-4 flex flex-wrap gap-2">
        {ACTIONS[org.status].map((a) => (
          <Button
            key={a.decision}
            size="sm"
            variant={a.variant}
            disabled={busy}
            onClick={() => (a.decision === "reject" || a.decision === "suspend" ? setNoteFor(a.decision) : decide(a.decision))}
          >
            {a.label}
          </Button>
        ))}
      </div>

      <Modal
        open={noteFor !== null}
        onClose={() => setNoteFor(null)}
        title={noteFor === "reject" ? `Rechazar ${org.name}` : `Suspender ${org.name}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (noteFor) void decide(noteFor, note);
          }}
          className="space-y-4"
        >
          <Label label="Motivo" hint="Le llega por mail a la administración de la organización.">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} required maxLength={1000} />
          </Label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setNoteFor(null)}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={busy || !note.trim()}>
              {noteFor === "reject" ? "Rechazar" : "Suspender"}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

function decisionTarget(d: OrgDecisionDto["decision"]): OrgStatus {
  return d === "reject" ? "rejected" : d === "suspend" ? "suspended" : "active";
}

function LicenseBadge({ status }: { status: LicenseStatus }) {
  return <StatusChip zone={LICENSE_ZONE[status]}>{LICENSE_LABEL[status]}</StatusChip>;
}

function LicenseQueue({ entries, onChanged }: { entries: PlatformLicenseEntry[]; onChanged: () => Promise<void> }) {
  const { toast } = useFeedback();
  const [rejecting, setRejecting] = useState<PlatformLicenseEntry | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function decide(l: PlatformLicenseEntry, decision: "reviewed" | "rejected", withNote?: string) {
    setErr(null);
    try {
      await api(`platform/licenses/${l.profileId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withNote ? { decision, note: withNote } : { decision }),
      });
      toast(decision === "reviewed" ? `Matrícula de ${l.fullName} revisada.` : `Matrícula de ${l.fullName} rechazada.`);
      setRejecting(null);
      setNote("");
      await onChanged();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  if (entries.length === 0) {
    return <EmptyState>No hay matrículas por revisar. Aparecen acá cuando alguien carga o cambia su matrícula.</EmptyState>;
  }

  return (
    <div className="space-y-3">
      {err && <Alert>{err}</Alert>}
      {entries.map((l) => (
        <Card key={l.profileId} className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">{l.fullName}</p>
            <p className="break-all text-sm text-stone-600">
              {formatLicense(l.licenseNumber, l.licenseJurisdiction)} · {l.orgName} · {l.email}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => decide(l, "reviewed")}>
              Marcar revisada
            </Button>
            <Button size="sm" variant="danger" onClick={() => setRejecting(l)}>
              Rechazar
            </Button>
          </div>
        </Card>
      ))}
      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title={`Rechazar la matrícula de ${rejecting?.fullName ?? ""}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (rejecting) void decide(rejecting, "rejected", note);
          }}
          className="space-y-4"
        >
          <Label label="Motivo" hint="Le llega por mail al profesional, que la puede corregir desde su perfil.">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} required maxLength={1000} />
          </Label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRejecting(null)}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={!note.trim()}>
              Rechazar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

const LEAD_ZONE: Record<LeadStatus, Zone | null> = {
  new: "warn",
  contacted: "ok",
  closed: null,
};

/** Qué se puede hacer con una consulta según su estado. */
const LEAD_ACTIONS: Record<LeadStatus, { to: LeadStatus; label: string; variant: "primary" | "secondary" | "ghost" }[]> = {
  new: [
    { to: "contacted", label: "Marcar contactada", variant: "primary" },
    { to: "closed", label: "Cerrar", variant: "ghost" },
  ],
  contacted: [{ to: "closed", label: "Cerrar", variant: "secondary" }],
  closed: [{ to: "new", label: "Reabrir", variant: "ghost" }],
};

/**
 * Consultas de "Hablemos para tu club" (KAN-80, ADR 0041): las nuevas arriba. El
 * contacto se hace por fuera (mail); acá queda el seguimiento y quién la marcó.
 */
function LeadsQueue({ entries, onChanged }: { entries: SalesLeadDto[]; onChanged: () => Promise<void> }) {
  const { toast } = useFeedback();
  const [err, setErr] = useState<string | null>(null);
  const order: Record<LeadStatus, number> = { new: 0, contacted: 1, closed: 2 };
  const sorted = [...entries].sort((a, b) => order[a.status] - order[b.status]);

  async function move(l: SalesLeadDto, to: LeadStatus) {
    setErr(null);
    try {
      await api(`platform/leads/${l.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      });
      toast(`${l.orgName}: ${LEAD_STATUS_LABEL[to].toLowerCase()}.`);
      await onChanged();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  if (entries.length === 0) {
    return <EmptyState>Todavía no hay consultas. Llegan desde el formulario de la landing (/clubes).</EmptyState>;
  }

  return (
    <div className="space-y-3">
      {err && <Alert>{err}</Alert>}
      {sorted.map((l) => (
        <Card key={l.id} className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-display text-xl font-bold uppercase tracking-[0.02em]">
                {l.orgName}
                <StatusChip zone={LEAD_ZONE[l.status]}>{LEAD_STATUS_LABEL[l.status]}</StatusChip>
              </p>
              <p className="text-sm text-stone-600">
                {LEAD_ORG_KIND_LABEL[l.orgKind]} · {LEAD_SIZE_LABEL[l.athletes]} deportistas ·{" "}
                {new Date(l.createdAt).toLocaleDateString("es-AR")}
              </p>
              <p className="mt-1 break-all text-sm">
                {l.fullName} ({LEAD_ROLE_LABEL[l.role]}) ·{" "}
                <a href={`mailto:${l.email}?subject=${encodeURIComponent(`Nutreitor para ${l.orgName}`)}`} className="text-brand hover:underline">
                  {l.email}
                </a>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {LEAD_ACTIONS[l.status].map((a) => (
                <Button key={a.to} size="sm" variant={a.variant} onClick={() => move(l, a.to)}>
                  {a.label}
                </Button>
              ))}
            </div>
          </div>
          {l.message && <p className="whitespace-pre-wrap rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">{l.message}</p>}
          {l.handledBy && l.status !== "new" && <p className="text-xs text-stone-500">Marcada por {l.handledBy}</p>}
        </Card>
      ))}
    </div>
  );
}
