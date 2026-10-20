"use client";

import { AlertTriangle, ClipboardList, LineChart as LineChartIcon, NotebookPen } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  activityLevels,
  clinicalFields,
  patientSexes,
  type ClinicalField,
  type ClinicalVisibility,
  type PatientDetailDto,
} from "@nutreitor/shared";

import { api, errorMessage } from "@/lib/api";
import { Alert, Button, Card, EmptyState, Loading, SectionHeading, Tabs, Toggle, fieldClass, tabPanelProps, type TabItem, useFeedback } from "@/components/ui";
import { MealPlanPanel } from "./meal-plan-panel";
import { AssistantDock } from "./assistant-dock";
import { AgentConversations } from "./agent-conversations";
import { MemberSelect } from "./member-select";
import { PatientConversation } from "@/components/messages/conversations";
import { ReportsPanel } from "@/components/reports/reports-panel";
import { AdherencePanel } from "./adherence-panel";
import { EnergyPanel } from "./energy-panel";
import { IntakePanel } from "./intake-panel";
import { AnthropometryPanel } from "./anthropometry-panel";
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

type TabId = "resumen" | "plan" | "requerimiento" | "ingesta" | "evolucion" | "antropometria" | "reportes" | "ficha" | "notas" | "mensajes" | "asistentes";
const TAB_IDS: TabId[] = ["resumen", "plan", "requerimiento", "ingesta", "evolucion", "antropometria", "reportes", "ficha", "notas", "mensajes", "asistentes"];

/**
 * Ficha del paciente en pestañas: un encabezado fijo (quién es + acciones) y una
 * pestaña por tarea (Resumen, Plan, Evolución, Ficha clínica, Notas, Asistentes).
 * Antes era una sola página de ~6 pantallas donde el plan y la evolución quedaban
 * enterrados. La pestaña activa vive en la URL (?tab=), así el "atrás" y los links
 * funcionan. La API ya hace el access check (404 si no corresponde).
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
  canEditVisibility: boolean;
  canUseAgent: boolean;
  /** Conversación privada con el paciente: sólo el profesional (ADR 0024), nunca la admin. */
  canMessage?: boolean;
}) {
  const [p, setP] = useState<PatientDetailDto | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "notfound">("loading");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get("tab") as TabId | null;
  const tab: TabId =
    requested && TAB_IDS.includes(requested) && (requested !== "asistentes" || canUseAgent) &&
    (requested !== "mensajes" || canMessage)
      ? requested
      : "resumen";
  const { toast } = useFeedback();
  // ¿Hay charlas con crisis? Marca la pestaña "Asistentes" para que se vea sin
  // tener que entrar (PSICO es supervisado: el profesional tiene que revisarlas).
  const [hasCrisis, setHasCrisis] = useState(false);
  useEffect(() => {
    if (!canUseAgent) return;
    api<{ crisis: boolean }[]>(`agents/conversations?patientId=${id}`)
      .then((list) => setHasCrisis(list.some((c) => c.crisis)))
      .catch(() => setHasCrisis(false));
  }, [canUseAgent, id]);
  const setTab = (next: TabId) =>
    router.replace(next === "resumen" ? pathname : `${pathname}?tab=${next}`, { scroll: false });

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

  return (
    // pb: que el botón flotante de asistentes no tape la última fila.
    <div className={canUseAgent ? "space-y-6 pb-24" : "space-y-6"}>
      <BackLink basePath={basePath} />

      <header className="flex flex-wrap items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-2xl font-semibold text-brand">
          {p.fullName.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900">
            {p.fullName}
          </h1>
          <p className="mt-0.5 text-sm text-stone-500">
            {[
              p.documentId ? `Doc ${p.documentId}` : null,
              age,
              p.sex ? SEX_LABEL[p.sex] : null,
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
            <div className="mt-1.5 flex flex-wrap gap-1">
              {p.groups.map((g) => (
                <Link
                  key={g.id}
                  href={`${basePath.replace(/\/patients$/, "/groups")}/${g.id}`}
                  className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600 hover:bg-brand/10 hover:text-brand"
                >
                  {g.name}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canInvite && <InviteToPortal patient={p} onDone={load} onError={setError} />}
          {canEdit && !editing && (
            <Button
              variant="secondary"
              onClick={() => {
                setTab("ficha");
                setEditing(true);
              }}
            >
              Editar ficha
            </Button>
          )}
        </div>
      </header>

      {error && <Alert>{error}</Alert>}

      <Tabs<TabId>
        label="Secciones de la ficha"
        value={tab}
        onChange={(t) => {
          setEditing(false);
          setTab(t);
        }}
        items={[
          { id: "resumen", label: "Resumen" },
          { id: "plan", label: "Plan" },
          { id: "requerimiento", label: "Requerimiento" },
          { id: "ingesta", label: "Ingesta" },
          { id: "evolucion", label: "Evolución" },
          { id: "antropometria", label: "Antropometría" },
          { id: "reportes", label: "Reportes" },
          { id: "ficha", label: "Ficha clínica" },
          { id: "notas", label: "Notas", count: p.notes.length },
          ...(canMessage ? [{ id: "mensajes", label: "Mensajes" } as TabItem<TabId>] : []),
          ...(canUseAgent
            ? [{ id: "asistentes", label: "Asistentes", alert: hasCrisis } as TabItem<TabId>]
            : []),
        ]}
      />

      <div {...tabPanelProps(tab)} className="focus-visible:outline-none">
        {tab === "resumen" && (
          <Summary
            patient={p}
            canWritePlan={canWritePlan}
            canRecord={canRecord}
            canAddNote={canAddNote}
            onGo={setTab}
          />
        )}
        {tab === "plan" && <MealPlanPanel patientId={p.id} canWrite={canWritePlan} canUseAgent={canUseAgent} />}
        {tab === "requerimiento" && <EnergyPanel patientId={p.id} canWrite={canWritePlan} />}
        {tab === "ingesta" && <IntakePanel patientId={p.id} canWrite={canWritePlan} />}
        {tab === "evolucion" && (
          <div className="space-y-6">
            <AdherencePanel patientId={p.id} />
            <MetricsPanel patientId={p.id} canRecord={canRecord} />
          </div>
        )}
        {tab === "antropometria" && (
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
        {tab === "reportes" && <ReportsPanel patientId={p.id} canWrite={canWritePlan} />}
        {tab === "ficha" && (
          <div className="space-y-6">
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
              <ReadView patient={p} age={age} />
            )}
            {!editing && canEditVisibility && p.clinical && p.clinicalVisibility && (
              <ClinicalVisibilityPanel
                patientId={p.id}
                visibility={p.clinicalVisibility}
                onChange={load}
                onError={setError}
              />
            )}
            <Assignments patient={p} canAssign={canAssign} onChange={load} onError={setError} />
          </div>
        )}
        {tab === "notas" && (
          <Notes patient={p} canAddNote={canAddNote} onChange={load} onError={setError} />
        )}
        {tab === "mensajes" && canMessage && <PatientConversation patientId={p.id} />}
        {tab === "asistentes" && canUseAgent && <AgentConversations patientId={p.id} />}
      </div>

      {canUseAgent && <AssistantDock patientId={p.id} />}
    </div>
  );
}

/**
 * Resumen: lo que hay que tener presente antes de atender, sin pedidos extra a la
 * API (sale de la ficha ya cargada) + accesos a las tareas de cada pestaña.
 */
function Summary({
  patient: p,
  canWritePlan,
  canRecord,
  canAddNote,
  onGo,
}: {
  patient: PatientDetailDto;
  canWritePlan: boolean;
  canRecord: boolean;
  canAddNote: boolean;
  onGo: (tab: TabId) => void;
}) {
  const alerts = p.clinical
    ? (
        [
          ["Alergias / intolerancias", p.clinical.allergies],
          ["Patologías diagnosticadas", p.clinical.diagnosedConditions],
          ["Medicación actual", p.clinical.currentMedication],
        ] as const
      ).filter(([, v]) => v && !/^(ninguna?|no|nada|sin datos|-|—)[.\s]*$/i.test(v.trim()))
    : [];
  const active = p.assignments.filter((a) => a.status === "active");
  const lastNote = p.notes[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-6">
        {alerts.length > 0 && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-900">
              <AlertTriangle className="h-4 w-4" aria-hidden />A tener en cuenta
            </h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              {alerts.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-amber-800">{label}</dt>
                  <dd className="text-sm text-amber-950">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <Card>
          <SectionHeading className="mb-4">Objetivo</SectionHeading>
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Field label="Objetivo" value={p.goal} />
            <Field label="Motivo de consulta" value={p.clinical?.reasonForConsult ?? null} />
            <Field label="Preferencias / restricciones" value={p.dietaryPreferences} wide />
            <Field label="Altura" value={p.heightCm ? `${p.heightCm} cm` : null} />
            <Field label="Peso inicial" value={p.initialWeightKg ? `${p.initialWeightKg} kg` : null} />
            <Field
              label="Actividad física"
              value={p.activityLevel ? ACTIVITY_LABEL[p.activityLevel] : null}
            />
          </dl>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <SectionHeading>Última nota</SectionHeading>
            {p.notes.length > 0 && (
              <button
                type="button"
                onClick={() => onGo("notas")}
                className="text-sm text-brand hover:underline"
              >
                Ver todas ({p.notes.length})
              </button>
            )}
          </div>
          {lastNote ? (
            <div>
              <p className="whitespace-pre-line text-sm text-stone-800">{lastNote.content}</p>
              <p className="mt-2 text-xs text-stone-500">
                {lastNote.authorName} · {new Date(lastNote.createdAt).toLocaleDateString("es-AR")}
              </p>
            </div>
          ) : (
            <EmptyState>Todavía no hay notas.</EmptyState>
          )}
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <SectionHeading className="mb-3">Acciones</SectionHeading>
          <div className="flex flex-col gap-2">
            <QuickAction icon={ClipboardList} onClick={() => onGo("plan")}>
              {canWritePlan ? "Revisar el plan" : "Ver el plan"}
            </QuickAction>
            <QuickAction icon={LineChartIcon} onClick={() => onGo("evolucion")}>
              {canRecord ? "Registrar una medición" : "Ver la evolución"}
            </QuickAction>
            {canAddNote && (
              <QuickAction icon={NotebookPen} onClick={() => onGo("notas")}>
                Agregar una nota
              </QuickAction>
            )}
          </div>
        </Card>
        <Card>
          <SectionHeading className="mb-3">Profesionales a cargo</SectionHeading>
          {active.length ? (
            <ul className="space-y-1 text-sm text-stone-800">
              {active.map((a) => (
                <li key={a.id}>{a.professionalName}</li>
              ))}
            </ul>
          ) : (
            <EmptyState>Sin profesional asignado.</EmptyState>
          )}
        </Card>
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  onClick,
  children,
}: {
  icon: typeof ClipboardList;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 items-center gap-3 rounded-lg border border-stone-200 px-3 text-left text-sm text-stone-700 transition hover:border-brand/40 hover:text-brand"
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {children}
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
