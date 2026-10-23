"use client";

import { AlertTriangle, ArrowRight, FileText, Pencil } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  activityLevels,
  clinicalFields,
  patientSexes,
  type ClinicalField,
  type ClinicalVisibility,
  type PatientDetailDto,
} from "@nutreitor/shared";

import { api, errorMessage } from "@/lib/api";
import { Alert, Button, Card, Loading, SectionHeading, SlideOver, Toggle, cn, fieldClass, tabPanelProps, useFeedback } from "@/components/ui";
import { MealPlanPanel } from "./meal-plan-panel";
import { AssistantDock } from "./assistant-dock";
import { AgentConversations } from "./agent-conversations";
import { MemberSelect } from "./member-select";
import { PatientConversation } from "@/components/messages/conversations";
import { ReportsPanel } from "@/components/reports/reports-panel";
import { AdherencePanel } from "./adherence-panel";
import { EnergyPanel } from "./energy-panel";
import { HydrationPanel } from "./hydration-panel";
import { IntakeTab } from "./intake-tab";
import { AnthropometryPanel } from "./anthropometry-panel";
import { AthleteScoreboard } from "./athlete-scoreboard";
import { AccessLogPanel } from "./access-log-panel";
import { MOMENTS, resolveTab, tabHref, type Moment, type Section } from "./moments";
import { MetricsPanel } from "./metrics-panel";

const SEX_LABEL: Record<string, string> = {
  female: "Femenino",
  male: "Masculino",
  other: "Otro",
  unspecified: "Sin especificar",
};
const ACTIVITY_LABEL: Record<string, string> = {
  sedentary: "Sedentario",
  light: "Ligera",
  moderate: "Moderada",
  active: "Activa",
  very_active: "Muy activa",
};
/** Etiquetas de los campos clínicos. Única fuente: la usan la lectura y el panel
 * de visibilidad. El orden de `clinicalFields` (shared) define el orden de render. */
const CLINICAL_LABELS: Record<ClinicalField, string> = {
  reasonForConsult: "Motivo de consulta",
  medicalHistory: "Antecedentes médicos",
  allergies: "Alergias / intolerancias",
  currentMedication: "Medicación actual",
  diagnosedConditions: "Patologías diagnosticadas",
  familyHistory: "Antecedentes familiares",
};

function ageFrom(birthDate: string | null): string | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  // Edad aproximada (sin tz: dato de ficha, no clínico de precisión).
  const today = new Date();
  let age = today.getUTCFullYear() - y;
  const mm = today.getUTCMonth() + 1;
  if (mm < m || (mm === m && today.getUTCDate() < d)) age -= 1;
  return age >= 0 && age < 130 ? `${age} años` : null;
}

/**
 * Ficha del deportista en cuatro momentos de trabajo (KAN-68, tema Estadio):
 * encabezado con el marcador de las últimas cifras, alertas clínicas siempre a la
 * vista y los momentos Evaluar · Prescribir · Seguir · Conversar, cada uno con sus
 * secciones. La ficha clínica vive en un panel lateral. El momento y la sección
 * van en la URL (`?tab=&sec=`), así el "atrás" y los links funcionan; los links
 * viejos de 12 pestañas se redirigen (ver `resolveTab`). La API ya hace el access
 * check (404 si no corresponde).
 */
export function PatientDetail({
  id,
  basePath,
  canEdit,
  canAssign,
  canAddNote,
  canRecord,
  canWritePlan,
  canInvite,
  canSeeAccessLog = false,
  canEditVisibility,
  canUseAgent,
  canMessage = false,
}: {
  id: string;
  basePath: string;
  canEdit: boolean;
  canAssign: boolean;
  canAddNote: boolean;
  canRecord: boolean;
  canWritePlan: boolean;
  canInvite: boolean;
  /** Admin: quién vio los datos del deportista (KAN-23). */
  canSeeAccessLog?: boolean;
  canEditVisibility: boolean;
  canUseAgent: boolean;
  /** Conversación privada con el paciente: sólo el profesional (ADR 0024), nunca la admin. */
  canMessage?: boolean;
}) {
  const [p, setP] = useState<PatientDetailDto | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "notfound">("loading");
  const [clinicalOpen, setClinicalOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const allowed = (s: Section) => (s !== "asistentes" || canUseAgent) && (s !== "mensajes" || canMessage);
  const view = resolveTab(params.get("tab"), params.get("sec"), allowed);
  const { toast } = useFeedback();
  // ¿Hay charlas con crisis? Marca "Conversar" y "Asistentes" para que se vea sin
  // tener que entrar (PSICO es supervisado: el profesional tiene que revisarlas).
  const [hasCrisis, setHasCrisis] = useState(false);
  useEffect(() => {
    if (!canUseAgent) return;
    api<{ crisis: boolean }[]>(`agents/conversations?patientId=${id}`)
      .then((list) => setHasCrisis(list.some((c) => c.crisis)))
      .catch(() => setHasCrisis(false));
  }, [canUseAgent, id]);
  const go = (moment: Moment, section: Section) =>
    router.replace(tabHref(pathname, moment, section), { scroll: false });

  // Links viejos (`?tab=plan`, `?tab=ficha`…): a la URL nueva; la ficha abre el panel.
  const legacy = !view.canonical;
  useEffect(() => {
    if (!legacy) return;
    if (view.clinical) setClinicalOpen(true);
    router.replace(tabHref(pathname, view.moment, view.section), { scroll: false });
  }, [legacy, view.clinical, view.moment, view.section, pathname, router]);

  const load = useCallback(async () => {
    try {
      setP(await api<PatientDetailDto>(`patients/${id}`));
      setState("ready");
    } catch {
      setState("notfound");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return <Loading label="Cargando ficha…" />;
  }
  if (state === "notfound" || !p) {
    return (
      <div>
        <BackLink basePath={basePath} />
        <p className="mt-6 text-sm text-stone-500">
          No encontramos esta ficha (o no tenés acceso).
        </p>
      </div>
    );
  }

  const age = ageFrom(p.birthDate);
  const alerts = clinicalAlerts(p);
  const moment = MOMENTS.find((m) => m.id === view.moment)!;
  const sections = moment.sections.filter((s) => allowed(s.id));
  const openClinical = (edit = false) => {
    setEditing(edit);
    setClinicalOpen(true);
  };

  return (
    // pb: que el botón flotante de asistentes no tape la última fila.
    <div className={canUseAgent ? "space-y-6 pb-24" : "space-y-6"}>
      <BackLink basePath={basePath} />

      <header className="flex flex-wrap items-start gap-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand/15 font-display text-4xl font-bold text-brand">
          {p.fullName.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-4xl font-semibold leading-none tracking-tight text-stone-900 sm:text-5xl">
            {p.fullName}
          </h1>
          <p className="mt-1.5 font-display text-sm font-semibold uppercase tracking-wider text-stone-500">
            {[
              p.documentId ? `Doc ${p.documentId}` : null,
              age,
              p.sex ? SEX_LABEL[p.sex] : null,
              p.goal,
            ]
              .filter(Boolean)
              .join(" · ") || "Sin datos de identificación"}
            {p.archivedAt && (
              <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-xs text-stone-600">
                archivado
              </span>
            )}
          </p>
          {p.groups.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {p.groups.map((g) => (
                <Link
                  key={g.id}
                  href={`${basePath.replace(/\/patients$/, "/groups")}/${g.id}`}
                  className="rounded-full border border-accent2/40 px-2.5 py-0.5 font-display text-xs font-semibold uppercase tracking-wider text-accent2 transition hover:bg-accent2/10"
                >
                  {g.name}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canInvite && <InviteToPortal patient={p} onDone={load} onError={setError} />}
          <Button variant="secondary" onClick={() => openClinical(false)}>
            <FileText className="h-4 w-4" aria-hidden />
            Ficha clínica
          </Button>
        </div>
      </header>

      {alerts.length > 0 && (
        <button
          type="button"
          onClick={() => openClinical(false)}
          className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-left text-sm transition hover:border-amber-300"
        >
          <span className="flex items-center gap-1.5 font-display font-semibold uppercase tracking-wider text-amber-700">
            <AlertTriangle className="h-4 w-4" aria-hidden />A tener en cuenta
          </span>
          {alerts.map(([label, value]) => (
            <span key={label} className="text-amber-900">
              <span className="text-amber-700">{label}:</span> {value}
            </span>
          ))}
        </button>
      )}

      {error && <Alert>{error}</Alert>}

      <AthleteScoreboard patientId={p.id} onGo={(m, s) => go(m, s as Section)} />

      <MomentTabs
        value={view.moment}
        onChange={(m) => go(m, MOMENTS.find((x) => x.id === m)!.sections.find((s) => allowed(s.id))!.id)}
        badges={{
          conversar: { count: p.notes.length, alert: hasCrisis },
        }}
      />

      <div {...tabPanelProps(view.moment)} className="space-y-5 focus-visible:outline-none">
        {sections.length > 1 && (
          <SectionPills
            label={`Secciones de ${moment.label}`}
            items={sections.map((s) => ({
              ...s,
              count: s.id === "notas" ? p.notes.length : undefined,
              alert: s.id === "asistentes" && hasCrisis,
            }))}
            value={view.section}
            onChange={(s) => go(view.moment, s)}
          />
        )}

        {view.section === "antropometria" && (
          <AnthropometryPanel
            patientId={p.id}
            sex={p.sex}
            birthDate={p.birthDate}
            canRecord={canRecord}
            visibility={p.clinicalVisibility}
            canEditVisibility={canEditVisibility}
            onVisibilityChange={load}
          />
        )}
        {view.section === "ingesta" && (
          <IntakeTab
            patientId={p.id}
            sex={p.sex === "female" || p.sex === "male" ? p.sex : null}
            canWrite={canWritePlan}
          />
        )}
        {view.section === "hidratacion" && <HydrationPanel patientId={p.id} canRecord={canRecord} />}
        {view.section === "requerimiento" && (
          <div className="space-y-4">
            <EnergyPanel patientId={p.id} canWrite={canWritePlan} />
            <NextStep onClick={() => go("prescribir", "plan")}>
              Armar el plan con estos objetivos por día
            </NextStep>
          </div>
        )}
        {view.section === "plan" && (
          <MealPlanPanel patientId={p.id} canWrite={canWritePlan} canUseAgent={canUseAgent} />
        )}
        {view.section === "evolucion" && (
          <div className="space-y-6">
            <AdherencePanel patientId={p.id} />
            <MetricsPanel patientId={p.id} canRecord={canRecord} />
          </div>
        )}
        {view.section === "reportes" && <ReportsPanel patientId={p.id} canWrite={canWritePlan} />}
        {view.section === "notas" && (
          <Notes patient={p} canAddNote={canAddNote} onChange={load} onError={setError} />
        )}
        {view.section === "mensajes" && canMessage && <PatientConversation patientId={p.id} />}
        {view.section === "asistentes" && canUseAgent && <AgentConversations patientId={p.id} />}
      </div>

      <SlideOver
        open={clinicalOpen}
        onClose={() => {
          setClinicalOpen(false);
          setEditing(false);
        }}
        wide
        header={
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-stone-500">Ficha clínica</p>
            <p className="truncate font-serif text-xl font-semibold">{p.fullName}</p>
          </div>
        }
      >
        <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain p-5">
          {editing ? (
            <EditForm
              patient={p}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                toast("Ficha actualizada");
                void load();
              }}
              onError={setError}
            />
          ) : (
            <>
              {canEdit && (
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" aria-hidden />
                  Editar ficha
                </Button>
              )}
              <ReadView patient={p} age={age} />
            </>
          )}
          {!editing && canEditVisibility && p.clinical && p.clinicalVisibility && (
            <ClinicalVisibilityPanel
              patientId={p.id}
              visibility={p.clinicalVisibility}
              onChange={load}
              onError={setError}
            />
          )}
          {!editing && <Assignments patient={p} canAssign={canAssign} onChange={load} onError={setError} />}
          {!editing && canSeeAccessLog && <AccessLogPanel patientId={p.id} />}
        </div>
      </SlideOver>

      {canUseAgent && <AssistantDock patientId={p.id} />}
    </div>
  );
}

/** Datos clínicos que hay que tener presentes siempre (se ignoran "ninguna", "no"…). */
function clinicalAlerts(p: PatientDetailDto) {
  if (!p.clinical) return [];
  return (
    [
      ["Alergias / intolerancias", p.clinical.allergies],
      ["Patologías", p.clinical.diagnosedConditions],
      ["Medicación", p.clinical.currentMedication],
    ] as const
  ).filter(([, v]) => v && !/^(ninguna?|no|nada|sin datos|-|—)[.\s]*$/i.test(v.trim()));
}

/**
 * Los cuatro momentos, como el marcador de una transmisión: número + nombre
 * grande. Patrón WAI-ARIA tabs (←/→/Inicio/Fin), igual que `Tabs`.
 */
function MomentTabs({
  value,
  onChange,
  badges,
}: {
  value: Moment;
  onChange: (m: Moment) => void;
  badges: Partial<Record<Moment, { count?: number; alert?: boolean }>>;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: KeyboardEvent, index: number) {
    const last = MOMENTS.length - 1;
    const next =
      e.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    onChange(MOMENTS[next]!.id);
    refs.current[next]?.focus();
  }
  return (
    <div role="tablist" aria-label="Momentos de la ficha" className="grid grid-cols-4 gap-1.5 sm:gap-2">
      {MOMENTS.map((m, i) => {
        const active = m.id === value;
        const b = badges[m.id];
        return (
          <button
            key={m.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${m.id}`}
            aria-selected={active}
            aria-controls={`panel-${m.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(m.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "relative flex min-h-14 flex-col items-start justify-center rounded-xl border px-2.5 py-2 text-left transition sm:px-4 sm:py-3",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
              active
                ? "border-brand bg-brand/15"
                : "border-stone-200 bg-surface hover:border-stone-300 hover:bg-stone-100",
            )}
          >
            <span className={cn("font-display text-xs font-bold tabular-nums", active ? "text-accent2" : "text-stone-500")}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span
              className={cn(
                "font-display text-base font-bold uppercase leading-tight tracking-wide sm:text-2xl",
                active ? "text-stone-900" : "text-stone-600",
              )}
            >
              {m.label}
            </span>
            <span className="hidden text-xs text-stone-500 md:block">{m.hint}</span>
            {(b?.alert || (b?.count ?? 0) > 0) && (
              <span className="absolute right-2 top-2 flex items-center gap-1">
                {b?.alert && <span className="h-2 w-2 rounded-full bg-zone-warn" aria-label="requiere atención" />}
                {(b?.count ?? 0) > 0 && (
                  <span className="rounded-full bg-stone-100 px-1.5 text-xs tabular-nums text-stone-600">{b!.count}</span>
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Secciones dentro de un momento: chips (no compiten con los momentos). */
function SectionPills({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { id: Section; label: string; count?: number; alert?: boolean }[];
  value: Section;
  onChange: (s: Section) => void;
}) {
  return (
    <nav aria-label={label} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {items.map((s) => {
        const active = s.id === value;
        return (
          <button
            key={s.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(s.id)}
            className={cn(
              "flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
              active
                ? "border-stone-900 bg-stone-900 font-medium text-stone-50"
                : "border-stone-200 text-stone-600 hover:border-stone-300 hover:text-stone-900",
            )}
          >
            {s.label}
            {s.count != null && s.count > 0 && (
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-stone-50/20" : "bg-stone-100")}>
                {s.count}
              </span>
            )}
            {s.alert && <span className="h-2 w-2 rounded-full bg-zone-warn" aria-label="requiere atención" />}
          </button>
        );
      })}
    </nav>
  );
}

/** Puente al paso siguiente del mismo momento (requerimiento → plan). */
function NextStep({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-brand/50 px-4 py-3 text-left text-sm font-medium text-brand transition hover:bg-brand/10"
    >
      {children}
      <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
    </button>
  );
}

/** Invita al paciente a su portal: invitación role=patient enlazada a esta entidad. */
function InviteToPortal({
  patient: p,
  onDone,
  onError,
}: {
  patient: PatientDetailDto;
  onDone: () => void;
  onError: (e: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (p.hasAccount) {
    return (
      <span className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
        Tiene portal
      </span>
    );
  }
  if (sent) {
    return (
      <span className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-500">
        Invitación enviada
      </span>
    );
  }

  async function invite() {
    if (!p.email) {
      onError("Cargá un email en la ficha para invitar al paciente.");
      return;
    }
    setBusy(true);
    onError("");
    try {
      await api("invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: p.email, role: "patient", patientId: p.id }),
      });
      setSent(true);
      onDone();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={invite}
      disabled={busy}
      className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-brand/40 hover:text-brand disabled:opacity-50"
    >
      {busy ? "Invitando…" : "Invitar al portal"}
    </button>
  );
}

function BackLink({ basePath }: { basePath: string }) {
  return (
    <Link
      href={basePath}
      className="inline-block text-sm text-stone-500 transition hover:text-brand"
    >
      ← Pacientes
    </Link>
  );
}

// ── Lectura ───────────────────────────────────────────────────────────────────

function ReadView({
  patient: p,
  age,
}: {
  patient: PatientDetailDto;
  age: string | null;
}) {
  return (
    <div className="space-y-6">
      <Section title="Identificación y contacto">
        <Field label="Documento" value={p.documentId} />
        <Field label="Fecha de nacimiento" value={p.birthDate} hint={age} />
        <Field label="Sexo" value={p.sex ? SEX_LABEL[p.sex] : null} />
        <Field label="Email" value={p.email} />
        <Field label="Teléfono" value={p.phone} />
        <Field label="País" value={p.country} />
        <Field label="Zona horaria" value={p.timezone} />
      </Section>

      <Section title="Antropométrico basal">
        <Field label="Altura" value={p.heightCm ? `${p.heightCm} cm` : null} />
        <Field
          label="Peso inicial"
          value={p.initialWeightKg ? `${p.initialWeightKg} kg` : null}
        />
      </Section>

      <Section title="Hábitos y objetivo">
        <Field
          label="Actividad física"
          value={p.activityLevel ? ACTIVITY_LABEL[p.activityLevel] : null}
        />
        <Field label="Objetivo" value={p.goal} />
        <Field label="Preferencias / restricciones" value={p.dietaryPreferences} wide />
      </Section>

      {p.clinical && (
        <Section title="Clínicos de base">
          {clinicalFields.map((f) => (
            <Field
              key={f}
              label={CLINICAL_LABELS[f]}
              value={p.clinical![f]}
              hint={p.clinicalVisibility?.[f] ? "visible al paciente" : undefined}
              wide
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <SectionHeading className="mb-4">{title}</SectionHeading>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">{children}</dl>
    </Card>
  );
}

/**
 * Visibilidad por campo de la ficha clínica hacia el PORTAL del paciente. Default
 * conservador: nada visible hasta que el profesional lo habilite. El stripping
 * real lo hace la API (`getMe`); acá sólo se configura. Optimista: refleja el
 * cambio al toque y revierte si el PATCH falla.
 */
function ClinicalVisibilityPanel({
  patientId,
  visibility,
  onChange,
  onError,
}: {
  patientId: string;
  visibility: ClinicalVisibility;
  onChange: () => void;
  onError: (msg: string) => void;
}) {
  const [pending, setPending] = useState<ClinicalField | null>(null);

  async function toggle(field: ClinicalField, next: boolean) {
    setPending(field);
    try {
      await api(`patients/${patientId}/clinical-visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next }),
      });
      onChange();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  const shownCount = clinicalFields.filter((f) => visibility[f]).length;

  return (
    <Card>
      <SectionHeading>Visible para el paciente</SectionHeading>
      <p className="mt-1 text-sm text-stone-500">
        Elegí qué datos clínicos ve el paciente en su portal. Por defecto no ve
        ninguno. Las notas clínicas nunca se comparten.
        {shownCount === 0
          ? " Hoy no ve ningún campo."
          : ` Hoy ve ${shownCount} de ${clinicalFields.length}.`}
      </p>
      <ul className="mt-4 divide-y divide-stone-100">
        {clinicalFields.map((f) => {
          const on = visibility[f] === true;
          return (
            <li key={f} className="flex items-center justify-between gap-4 py-3">
              <span className="text-sm text-stone-700">{CLINICAL_LABELS[f]}</span>
              <Toggle
                on={on}
                busy={pending === f}
                label={`${on ? "Ocultar" : "Mostrar"} ${CLINICAL_LABELS[f]} al paciente`}
                onChange={() => void toggle(f, !on)}
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Field({
  label,
  value,
  hint,
  wide,
}: {
  label: string;
  value: string | null;
  hint?: string | null;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-sm text-stone-800">
        {value || <span className="text-stone-300">—</span>}
        {value && hint ? <span className="ml-2 text-stone-500">({hint})</span> : null}
      </dd>
    </div>
  );
}

// ── Edición ───────────────────────────────────────────────────────────────────

// Estilo de campo compartido (fuente única en components/ui) + ancho completo.
const inputCls = `w-full ${fieldClass}`;

function EditForm({
  patient: p,
  onCancel,
  onSaved,
  onError,
}: {
  patient: PatientDetailDto;
  onCancel: () => void;
  onSaved: () => void;
  onError: (e: string) => void;
}) {
  const [f, setF] = useState({
    fullName: p.fullName,
    documentId: p.documentId ?? "",
    birthDate: p.birthDate ?? "",
    sex: p.sex ?? "",
    email: p.email ?? "",
    phone: p.phone ?? "",
    country: p.country ?? "",
    timezone: p.timezone ?? "",
    heightCm: p.heightCm?.toString() ?? "",
    initialWeightKg: p.initialWeightKg?.toString() ?? "",
    activityLevel: p.activityLevel ?? "",
    goal: p.goal ?? "",
    dietaryPreferences: p.dietaryPreferences ?? "",
    reasonForConsult: p.clinical?.reasonForConsult ?? "",
    medicalHistory: p.clinical?.medicalHistory ?? "",
    allergies: p.clinical?.allergies ?? "",
    currentMedication: p.clinical?.currentMedication ?? "",
    diagnosedConditions: p.clinical?.diagnosedConditions ?? "",
    familyHistory: p.clinical?.familyHistory ?? "",
  });
  const [busy, setBusy] = useState(false);
  const upd = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const orNull = (v: string) => (v.trim() ? v.trim() : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError("");
    try {
      const body: Record<string, unknown> = {
        fullName: f.fullName.trim(),
        documentId: orNull(f.documentId),
        birthDate: orNull(f.birthDate),
        sex: f.sex || null,
        email: orNull(f.email),
        phone: orNull(f.phone),
        country: orNull(f.country),
        timezone: orNull(f.timezone),
        heightCm: f.heightCm ? Number(f.heightCm) : null,
        initialWeightKg: f.initialWeightKg ? Number(f.initialWeightKg) : null,
        activityLevel: f.activityLevel || null,
        goal: orNull(f.goal),
        dietaryPreferences: orNull(f.dietaryPreferences),
      };
      if (p.clinical) {
        Object.assign(body, {
          reasonForConsult: orNull(f.reasonForConsult),
          medicalHistory: orNull(f.medicalHistory),
          allergies: orNull(f.allergies),
          currentMedication: orNull(f.currentMedication),
          diagnosedConditions: orNull(f.diagnosedConditions),
          familyHistory: orNull(f.familyHistory),
        });
      }
      await api(`patients/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onSaved();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <FieldsetCard title="Identificación y contacto">
        <L label="Nombre y apellido">
          <input value={f.fullName} onChange={(e) => upd("fullName", e.target.value)} className={inputCls} />
        </L>
        <L label="Documento">
          <input value={f.documentId} onChange={(e) => upd("documentId", e.target.value)} className={inputCls} />
        </L>
        <L label="Fecha de nacimiento (YYYY-MM-DD)">
          <input value={f.birthDate} onChange={(e) => upd("birthDate", e.target.value)} placeholder="1990-05-12" className={inputCls} />
        </L>
        <L label="Sexo">
          <select value={f.sex} onChange={(e) => upd("sex", e.target.value)} className={inputCls}>
            <option value="">—</option>
            {patientSexes.map((s) => (
              <option key={s} value={s}>{SEX_LABEL[s]}</option>
            ))}
          </select>
        </L>
        <L label="Email">
          <input type="email" value={f.email} onChange={(e) => upd("email", e.target.value)} className={inputCls} />
        </L>
        <L label="Teléfono">
          <input value={f.phone} onChange={(e) => upd("phone", e.target.value)} className={inputCls} />
        </L>
        <L label="País">
          <input value={f.country} onChange={(e) => upd("country", e.target.value)} className={inputCls} />
        </L>
        <L label="Zona horaria">
          <input value={f.timezone} onChange={(e) => upd("timezone", e.target.value)} placeholder="America/Argentina/Buenos_Aires" className={inputCls} />
        </L>
      </FieldsetCard>

      <FieldsetCard title="Antropométrico basal">
        <L label="Altura (cm)">
          <input type="number" value={f.heightCm} onChange={(e) => upd("heightCm", e.target.value)} className={inputCls} />
        </L>
        <L label="Peso inicial (kg)">
          <input type="number" step="0.1" value={f.initialWeightKg} onChange={(e) => upd("initialWeightKg", e.target.value)} className={inputCls} />
        </L>
      </FieldsetCard>

      <FieldsetCard title="Hábitos y objetivo">
        <L label="Actividad física">
          <select value={f.activityLevel} onChange={(e) => upd("activityLevel", e.target.value)} className={inputCls}>
            <option value="">—</option>
            {activityLevels.map((a) => (
              <option key={a} value={a}>{ACTIVITY_LABEL[a]}</option>
            ))}
          </select>
        </L>
        <L label="Objetivo">
          <input value={f.goal} onChange={(e) => upd("goal", e.target.value)} className={inputCls} />
        </L>
        <L label="Preferencias / restricciones" wide>
          <textarea value={f.dietaryPreferences} onChange={(e) => upd("dietaryPreferences", e.target.value)} rows={2} className={inputCls} />
        </L>
      </FieldsetCard>

      {p.clinical && (
        <FieldsetCard title="Clínicos de base">
          <L label="Motivo de consulta" wide>
            <textarea value={f.reasonForConsult} onChange={(e) => upd("reasonForConsult", e.target.value)} rows={2} className={inputCls} />
          </L>
          <L label="Antecedentes médicos" wide>
            <textarea value={f.medicalHistory} onChange={(e) => upd("medicalHistory", e.target.value)} rows={2} className={inputCls} />
          </L>
          <L label="Alergias / intolerancias" wide>
            <textarea value={f.allergies} onChange={(e) => upd("allergies", e.target.value)} rows={2} className={inputCls} />
          </L>
          <L label="Medicación actual" wide>
            <textarea value={f.currentMedication} onChange={(e) => upd("currentMedication", e.target.value)} rows={2} className={inputCls} />
          </L>
          <L label="Patologías diagnosticadas" wide>
            <textarea value={f.diagnosedConditions} onChange={(e) => upd("diagnosedConditions", e.target.value)} rows={2} className={inputCls} />
          </L>
          <L label="Antecedentes familiares" wide>
            <textarea value={f.familyHistory} onChange={(e) => upd("familyHistory", e.target.value)} rows={2} className={inputCls} />
          </L>
        </FieldsetCard>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !f.fullName.trim()}
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-brand-fg transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Guardando…" : "Guardar ficha"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2.5 text-sm text-stone-500 transition hover:bg-stone-100"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function FieldsetCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <SectionHeading className="mb-4">{title}</SectionHeading>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

function L({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? "block sm:col-span-2" : "block"}>
      <span className="mb-1 block text-xs text-stone-500">{label}</span>
      {children}
    </label>
  );
}

// ── Asignaciones ────────────────────────────────────────────────────────────--

function Assignments({
  patient: p,
  canAssign,
  onChange,
  onError,
}: {
  patient: PatientDetailDto;
  canAssign: boolean;
  onChange: () => void;
  onError: (e: string) => void;
}) {
  const [assignTo, setAssignTo] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm } = useFeedback();

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    onError("");
    try {
      await fn();
      onChange();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionHeading className="mb-4">Profesionales a cargo</SectionHeading>

      {p.assignments.length === 0 ? (
        <p className="text-sm text-stone-500">Sin asignaciones.</p>
      ) : (
        <ul className="space-y-2">
          {p.assignments.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-stone-100 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-stone-800">{a.professionalName}</div>
                <div className="text-xs text-stone-500">
                  {a.status === "active" ? "Activa" : "Cerrada"} · desde{" "}
                  {new Date(a.assignedAt).toLocaleDateString("es-AR")}
                  {a.endedAt
                    ? ` · hasta ${new Date(a.endedAt).toLocaleDateString("es-AR")}`
                    : ""}
                </div>
              </div>
              {a.status === "active" ? (
                <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">
                  activa
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                  cerrada
                </span>
              )}
              {canAssign && a.status === "active" && (
                <button
                  disabled={busy}
                  onClick={async () => {
                    const ok = await confirm({
                      title: `¿Cerrar la asignación de ${a.professionalName}?`,
                      body: "Deja de ver a este paciente. La asignación queda en el historial.",
                      confirmLabel: "Cerrar asignación",
                      tone: "danger",
                    });
                    if (ok) run(() => api(`patients/${p.id}/assignments/${a.id}/end`, { method: "POST" }));
                  }}
                  className="shrink-0 text-xs text-stone-500 transition hover:text-red-600"
                >
                  Cerrar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canAssign && (
        <div className="mt-4 flex items-end gap-2 border-t border-stone-100 pt-4">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-stone-500">Asignar profesional</span>
            <MemberSelect value={assignTo} onChange={setAssignTo} />
          </label>
          <button
            disabled={busy || !assignTo}
            onClick={() =>
              run(async () => {
                await api(`patients/${p.id}/assignments`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ membershipId: assignTo }),
                });
                setAssignTo("");
              })
            }
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition hover:brightness-110 disabled:opacity-40"
          >
            Asignar
          </button>
        </div>
      )}
    </Card>
  );
}

// ── Notas ─────────────────────────────────────────────────────────────────────

function Notes({
  patient: p,
  canAddNote,
  onChange,
  onError,
}: {
  patient: PatientDetailDto;
  canAddNote: boolean;
  onChange: () => void;
  onError: (e: string) => void;
}) {
  const [content, setContent] = useState("");
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    onError("");
    try {
      await api(`patients/${p.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });
      setContent("");
      toast("Nota agregada");
      onChange();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionHeading className="mb-4">Notas clínicas</SectionHeading>

      {canAddNote && (
        <form onSubmit={add} className="mb-5">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="Agregar una nota… (no se edita ni se borra; para corregir, agregá otra)"
            className={inputCls}
          />
          <button
            type="submit"
            disabled={busy || !content.trim()}
            className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? "Guardando…" : "Agregar nota"}
          </button>
        </form>
      )}

      {p.notes.length === 0 ? (
        <p className="text-sm text-stone-500">Sin notas todavía.</p>
      ) : (
        <ol className="space-y-3">
          {p.notes.map((n) => (
            <li key={n.id} className="border-l-2 border-brand/30 pl-3">
              <div className="text-xs text-stone-500">
                {n.authorName} ·{" "}
                {new Date(n.createdAt).toLocaleString("es-AR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  hour12: false,
                })}
              </div>
              <p className="mt-0.5 whitespace-pre-line text-sm text-stone-800">
                {n.content}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
