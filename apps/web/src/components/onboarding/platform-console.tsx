"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  LicenseStatus,
  OrgDecisionDto,
  OrgStatus,
  PlatformLicenseEntry,
  PlatformMe,
  PlatformOrgEntry,
} from "@nutreitor/shared";
import { formatLicense } from "@nutreitor/shared";

import {
  Alert,
  Button,
  Card,
  EmptyState,
  FeedbackProvider,
  Input,
  Label,
  Loading,
  Modal,
  Tabs,
  Textarea,
  cn,
  tabPanelProps,
  useFeedback,
} from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";

type Tab = "pending_review" | "active" | "closed" | "licenses";

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

const LICENSE_TONE: Record<LicenseStatus, string> = {
  missing: "bg-stone-100 text-stone-600",
  declared: "bg-amber-50 text-amber-800",
  reviewed: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-700",
};

/**
 * Consola de plataforma (dominio raíz, ADR 0025): aprobar organizaciones y revisar
 * matrículas. Sesión propia, separada de la de los tenants.
 */
export function PlatformConsole() {
  const [me, setMe] = useState<PlatformMe | null | undefined>(undefined);

  useEffect(() => {
    api<PlatformMe>("platform/auth/me")
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  if (me === undefined) return <Loading />;
  if (!me) return <PlatformLogin onDone={setMe} />;
  return (
    <FeedbackProvider>
      <Console me={me} onLogout={() => setMe(null)} />
    </FeedbackProvider>
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
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Consola de plataforma</h1>
      <p className="text-sm text-ink/60">Sólo para el equipo de operación de Nutreitor.</p>
      <Label label="Email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
      </Label>
      <Label label="Contraseña">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      </Label>
      {err && <Alert>{err}</Alert>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Ingresando…" : "Ingresar"}
      </Button>
      <p className="text-center text-sm">
        <a href="/olvide" className="text-ink/60 underline-offset-4 hover:text-brand hover:underline">
          ¿Olvidaste tu contraseña?
        </a>
      </p>
    </form>
  );
}

function Console({ me, onLogout }: { me: PlatformMe; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("pending_review");
  const [orgs, setOrgs] = useState<PlatformOrgEntry[] | null>(null);
  const [licenses, setLicenses] = useState<PlatformLicenseEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, l] = await Promise.all([
        api<PlatformOrgEntry[]>("platform/orgs"),
        api<PlatformLicenseEntry[]>("platform/licenses"),
      ]);
      setOrgs(o);
      setLicenses(l);
      setErr(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onLogout();
      setErr(errorMessage(e));
    }
  }, [onLogout]);

  useEffect(() => {
    void load();
  }, [load]);

  async function logout() {
    await api("platform/auth/logout", { method: "POST" }).catch(() => undefined);
    onLogout();
  }

  const byTab = (t: Tab) =>
    (orgs ?? []).filter((o) =>
      t === "closed" ? o.status === "rejected" || o.status === "suspended" : o.status === t,
    );
  const pendingCount = byTab("pending_review").length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Consola de plataforma</h1>
          <p className="mt-1 text-sm text-ink/60">
            Altas de organizaciones y matrículas. No muestra datos de pacientes.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-ink/60">
          <span>{me.fullName}</span>
          <Button variant="ghost" size="sm" onClick={logout}>
            Salir
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <Tabs<Tab>
          label="Secciones de la consola"
          value={tab}
          onChange={setTab}
          items={[
            { id: "pending_review", label: "En revisión", count: pendingCount, alert: pendingCount > 0 },
            { id: "licenses", label: "Matrículas", count: licenses?.length ?? 0 },
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
          <h2 className="text-xl font-bold tracking-tight">{org.name}</h2>
          <p className="mt-0.5 break-all text-sm text-ink/55">
            {org.slug} · {org.kind === "individual" ? "Profesional independiente" : "Equipo"} · registrada el{" "}
            {new Date(org.createdAt).toLocaleDateString("es-AR")}
          </p>
        </div>
        <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-700">{STATUS_LABEL[org.status]}</span>
      </div>

      {org.reviewNote && <p className="mt-3 text-sm text-ink/70">Motivo: {org.reviewNote}</p>}

      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink/45">Administración</dt>
          {org.admins.map((a) => (
            <dd key={a.email} className="mt-1 break-all">
              {a.fullName} · <span className="text-ink/60">{a.email}</span>
            </dd>
          ))}
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-ink/45">Matrículas</dt>
          {org.licenses.length === 0 && <dd className="mt-1 text-ink/55">Nadie declaró matrícula.</dd>}
          {org.licenses.map((l) => (
            <dd key={l.profileId} className="mt-1 flex flex-wrap items-center gap-2">
              <span>{l.fullName}</span>
              <span className="text-ink/60">{formatLicense(l.licenseNumber, l.licenseJurisdiction) ?? "—"}</span>
              <LicenseBadge status={l.licenseStatus} />
            </dd>
          ))}
        </div>
      </dl>

      {org.status === "pending_review" && declared > 0 && (
        <p className="mt-4 text-xs text-ink/55">
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
  return <span className={cn("rounded-full px-2 py-0.5 text-xs", LICENSE_TONE[status])}>{LICENSE_LABEL[status]}</span>;
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
            <p className="font-medium">{l.fullName}</p>
            <p className="break-all text-sm text-ink/60">
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
