"use client";

import { FlaskConical, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ANTHROPOMETRY_VALIDATED,
  ANTHRO_SITES,
  ageAt,
  anthroVisibilityFields,
  anthropometryResults,
  needsThirdTake,
  type AnthroGroup,
  type AnthroResults,
  type AnthroSiteKey,
  type AnthroTakes,
  type AnthroVisibilityField,
  type AnthropometrySessionDto,
  type Calc,
  type ClinicalVisibility,
  type PatientSex,
} from "@nutreitor/shared";

import { Alert, Button, Card, EmptyState, Input, Label, Loading, Modal, SectionHeading, Select, Textarea, Toggle, cn, useFeedback } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

import { fmt, fmtMeasured, parseDecimal, val } from "./anthro-format";
import { LineChart } from "./line-chart";
import { KerrRing } from "./kerr-ring";
import { Somatochart, type SomatoPoint } from "./somatochart";

const GROUPS: { id: AnthroGroup; label: string }[] = [
  { id: "basic", label: "Básicas" },
  { id: "skinfold", label: "Pliegues (mm)" },
  { id: "girth", label: "Perímetros (cm)" },
  { id: "breadth", label: "Diámetros (cm)" },
];

type FatEq = "durninWomersley" | "yuhasz" | "faulkner";
const FAT_LABEL: Record<FatEq, string> = {
  durninWomersley: "Durnin-Womersley + Siri",
  yuhasz: "Yuhasz",
  faulkner: "Faulkner",
};

const VIS_LABEL: Record<AnthroVisibilityField, string> = {
  anthroSkinfolds: "Σ6 y Σ8 pliegues",
  anthroFat: "% graso",
  anthroKerr: "Masa muscular, adiposa y ósea (Kerr)",
  anthroSomatotype: "Somatotipo",
};


/**
 * Antropometría ISAK de un deportista (ADR 0030): sesiones con sus tomas, resultados
 * calculados (Σ pliegues, % graso, somatotipo, Kerr) y evolución. Si la marca de beta
 * vuelve (`ANTHROPOMETRY_VALIDATED = false`), se avisa y el portal no muestra nada.
 */
export function AnthropometryPanel({
  patientId,
  sex,
  birthDate,
  canRecord,
  visibility,
  canEditVisibility,
  onVisibilityChange,
}: {
  patientId: string;
  sex: PatientSex | null;
  birthDate: string | null;
  canRecord: boolean;
  visibility: ClinicalVisibility | null;
  canEditVisibility: boolean;
  onVisibilityChange: () => void;
}) {
  const [sessions, setSessions] = useState<AnthropometrySessionDto[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<AnthropometrySessionDto | "new" | null>(null);
  const [fatEq, setFatEq] = useState<FatEq>("durninWomersley");
  const { toast, confirm } = useFeedback();

  const load = useCallback(async () => {
    try {
      setSessions(await api<AnthropometrySessionDto[]>(`patients/${patientId}/anthropometry`));
    } catch (e) {
      setErr(errorMessage(e));
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(s: AnthropometrySessionDto) {
    const ok = await confirm({ title: "¿Borrar esta sesión?", body: `La medición del ${fmtMeasured(s.measuredAt)} y sus tomas.`, confirmLabel: "Borrar", tone: "danger" });
    if (!ok) return;
    try {
      await api(`patients/${patientId}/anthropometry/${s.id}`, { method: "DELETE" });
      toast("Sesión borrada");
      await load();
    } catch (e) {
      setErr(errorMessage(e));
    }
  }

  const chrono = useMemo(() => [...(sessions ?? [])].reverse(), [sessions]);
  const series = (pick: (r: AnthroResults) => number | null) =>
    chrono.flatMap((s) => {
      const v = pick(s.results);
      return v === null ? [] : [{ label: s.measuredAt.slice(5).split("-").reverse().join("/"), value: v }];
    });

  // Estela de la somatocarta: una sesión por punto, de la más vieja a la última.
  const somatoTrail: SomatoPoint[] = chrono.flatMap((s) => {
    const so = val(s.results.somatotype);
    return so ? [{ id: s.id, label: fmtMeasured(s.measuredAt), ...so }] : [];
  });

  // Anillo de Kerr: la última sesión con Kerr, contra la anterior con Kerr.
  const withKerr = (sessions ?? []).flatMap((s) => {
    const k = val(s.results.kerr);
    return k ? [{ s, k }] : [];
  });
  const [kerrLast, kerrPrev] = withKerr;

  if (!sessions) return err ? <Alert>{err}</Alert> : <Loading />;
  const beta = !ANTHROPOMETRY_VALIDATED;
  const binarySex = sex === "female" || sex === "male";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionHeading>Antropometría ISAK</SectionHeading>
          <p className="mt-1 text-sm text-stone-500">Perfil restringido, con bloque opcional para el fraccionamiento de Kerr.</p>
        </div>
        {canRecord && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden /> Nueva sesión
          </Button>
        )}
      </div>

      {beta && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <span className="font-medium">Cálculos en validación.</span> Revisalos contra tu planilla antes de usarlos
            para decidir. Mientras tanto el deportista no ve resultados en su portal.
          </p>
        </div>
      )}
      {!binarySex && (
        <Alert tone="info">Cargá el sexo (femenino o masculino) en la ficha: las ecuaciones de % graso y Kerr dependen de él.</Alert>
      )}
      {err && <Alert>{err}</Alert>}

      {sessions.length === 0 ? (
        <EmptyState>Todavía no hay mediciones antropométricas.</EmptyState>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <p className="text-sm font-medium text-stone-700">Σ6 pliegues (mm)</p>
              <div className="mt-3">
                <LineChart data={series((r) => val(r.sum6))} unit=" mm" height={140} />
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-stone-700">% graso</p>
                <Select value={fatEq} onChange={(e) => setFatEq(e.target.value as FatEq)} className="w-auto py-1 text-xs" aria-label="Ecuación de % graso">
                  {(Object.keys(FAT_LABEL) as FatEq[]).map((k) => (
                    <option key={k} value={k}>{FAT_LABEL[k]}</option>
                  ))}
                </Select>
              </div>
              <div className="mt-3">
                <LineChart data={series((r) => val(r.fat[fatEq]))} unit="%" height={140} />
              </div>
            </Card>
            <Card>
              <p className="text-sm font-medium text-stone-700">Masa muscular · Kerr (kg)</p>
              <div className="mt-3">
                <LineChart data={series((r) => val(r.kerr)?.muscleKg ?? null)} unit=" kg" height={140} />
              </div>
            </Card>
          </div>

          {(somatoTrail.length > 0 || kerrLast) && (
            <div className="grid gap-4 xl:grid-cols-2">
              {kerrLast && (
                <Card>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-stone-700">Composición corporal · Kerr</p>
                    <p className="text-xs text-stone-500">
                      {fmtMeasured(kerrLast.s.measuredAt)}
                      {kerrPrev ? ` · comparado con ${fmtMeasured(kerrPrev.s.measuredAt)}` : ""}
                    </p>
                  </div>
                  <KerrRing
                    kerr={kerrLast.k}
                    previous={kerrPrev?.k}
                    previousLabel={kerrPrev ? shortDay(kerrPrev.s.measuredAt) : undefined}
                    className="mt-4"
                  />
                </Card>
              )}
              {somatoTrail.length > 0 && (
                <Card>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-stone-700">Somatocarta · Heath-Carter</p>
                    <p className="text-xs text-stone-500">
                      {somatoTrail.length > 1
                        ? `Estela de ${somatoTrail.length} mediciones; el punto grande es la última.`
                        : "Una medición: con la próxima se ve la estela."}
                    </p>
                  </div>
                  <Somatochart
                    trail={somatoTrail}
                    label={`Somatocarta: ${somatoTrail.length} mediciones`}
                    className="mx-auto mt-3 max-w-md"
                  />
                </Card>
              )}
            </div>
          )}

          <ul className="space-y-4">
            {sessions.map((s) => (
              <li key={s.id}>
                <SessionCard session={s} canRecord={canRecord} onEdit={() => setEditing(s)} onDelete={() => remove(s)} />
              </li>
            ))}
          </ul>
        </>
      )}

      {canEditVisibility && visibility && (
        <VisibilityCard patientId={patientId} visibility={visibility} beta={beta} onChange={onVisibilityChange} onError={setErr} />
      )}

      {editing && (
        <SessionForm
          patientId={patientId}
          initial={editing === "new" ? null : editing}
          sex={binarySex ? (sex as "female" | "male") : null}
          birthDate={birthDate}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            toast("Sesión guardada");
            await load();
          }}
        />
      )}
    </div>
  );
}

function SessionCard({
  session: s,
  canRecord,
  onEdit,
  onDelete,
}: {
  session: AnthropometrySessionDto;
  canRecord: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const r = s.results;
  const so = val(r.somatotype);
  const k = val(r.kerr);
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-stone-900">{fmtMeasured(s.measuredAt)}</p>
          <p className="text-xs text-stone-500">
            {s.measuredByName ? `Midió ${s.measuredByName}` : ""}
            {s.note ? ` · ${s.note}` : ""}
          </p>
        </div>
        {canRecord && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Editar sesión">
              <Pencil className="h-4 w-4" aria-hidden />
            </Button>
            <Button size="sm" variant="danger" onClick={onDelete} aria-label="Borrar sesión">
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Σ6 pliegues" value={val(r.sum6)} unit="mm" />
        <Metric label="Σ8 pliegues" value={val(r.sum8)} unit="mm" />
        <Metric label="% graso (D-W + Siri)" value={val(r.fat.durninWomersley)} unit="%" reason={reason(r.fat.durninWomersley)} />
        <Metric label="% graso (Yuhasz)" value={val(r.fat.yuhasz)} unit="%" reason={reason(r.fat.yuhasz)} />
        <Metric label="% graso (Faulkner)" value={val(r.fat.faulkner)} unit="%" reason={reason(r.fat.faulkner)} />
        <div className="col-span-2 rounded-xl bg-stone-50 p-3 sm:col-span-3">
          <dt className="text-xs text-stone-500">Somatotipo (endo · meso · ecto)</dt>
          <dd className="mt-1 text-lg font-semibold text-stone-900">
            {so ? `${fmt(so.endo)} · ${fmt(so.meso)} · ${fmt(so.ecto)}` : "—"}
          </dd>
          {so ? (
            <p className="text-xs text-stone-500">Somatocarta: x {fmt(so.x)}, y {fmt(so.y)}</p>
          ) : (
            <p className="text-xs text-stone-500">{reason(r.somatotype)}</p>
          )}
        </div>
      </dl>

      <div className="mt-4">
        <p className="text-sm font-medium text-stone-700">Fraccionamiento en 5 componentes (Kerr)</p>
        {k ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-500">
                  <th className="py-1 font-medium">Componente</th>
                  <th className="py-1 text-right font-medium">kg</th>
                  <th className="py-1 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {([
                  ["Muscular", k.muscleKg, k.pct.muscle],
                  ["Adiposa", k.adiposeKg, k.pct.adipose],
                  ["Ósea", k.boneKg, k.pct.bone],
                  ["Residual", k.residualKg, k.pct.residual],
                  ["Piel", k.skinKg, k.pct.skin],
                ] as const).map(([label, kg, pct]) => (
                  <tr key={label}>
                    <td className="py-1.5">{label}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt(kg, 2)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt(pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={cn("mt-2 text-xs", Math.abs(k.diffPct) > 5 ? "text-red-700" : "text-stone-500")}>
              Masa estimada {fmt(k.totalKg, 2)} kg ({k.diffPct > 0 ? "+" : ""}{fmt(k.diffPct)}% sobre la medida
              {Math.abs(k.diffPct) > 5 ? ": fuera del ±5% aceptable, revisá las medidas" : ""}). Índice músculo/óseo {fmt(k.muscleBoneIndex, 2)}.
            </p>
          </div>
        ) : (
          <p className="mt-1 text-sm text-stone-500">{reason(r.kerr)}</p>
        )}
      </div>
    </Card>
  );
}

const reason = <T,>(c: Calc<T>) => (c.ok ? undefined : c.reason);

function Metric({ label, value, unit, reason: why }: { label: string; value: number | null; unit: string; reason?: string }) {
  return (
    <div className="rounded-xl bg-stone-50 p-3">
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-stone-900">{value === null ? "—" : `${fmt(value)} ${unit}`}</dd>
      {value === null && why && <p className="text-xs text-stone-500">{why}</p>}
    </div>
  );
}

function VisibilityCard({
  patientId,
  visibility,
  beta,
  onChange,
  onError,
}: {
  patientId: string;
  visibility: ClinicalVisibility;
  beta: boolean;
  onChange: () => void;
  onError: (m: string) => void;
}) {
  const [pending, setPending] = useState<AnthroVisibilityField | null>(null);
  async function toggle(field: AnthroVisibilityField) {
    setPending(field);
    try {
      await api(`patients/${patientId}/clinical-visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: visibility[field] !== true }),
      });
      onChange();
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setPending(null);
    }
  }
  return (
    <Card>
      <SectionHeading>Visible para el deportista</SectionHeading>
      <p className="mt-1 text-sm text-stone-500">
        Elegí qué resultados ve en su portal. Por defecto, ninguno.
        {beta && " Mientras los cálculos estén en validación, no se muestra nada aunque lo actives."}
      </p>
      <ul className="mt-3 divide-y divide-stone-100">
        {anthroVisibilityFields.map((f) => (
          <li key={f} className="flex items-center justify-between gap-4 py-3">
            <span className="text-sm text-stone-700">{VIS_LABEL[f]}</span>
            <Toggle on={visibility[f] === true} onChange={() => toggle(f)} label={`Mostrar ${VIS_LABEL[f]}`} busy={pending === f} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── Carga de una sesión ───────────────────────────────────────────────────────

type Draft = Partial<Record<AnthroSiteKey, [string, string, string]>>;

const toDraft = (takes: AnthroTakes): Draft =>
  Object.fromEntries(
    Object.entries(takes).map(([k, t]) => [k, [0, 1, 2].map((i) => (t?.[i] === undefined ? "" : String(t[i]).replace(".", ","))) as [string, string, string]]),
  ) as Draft;

const parse = parseDecimal;

function draftTakes(d: Draft): AnthroTakes {
  const out: AnthroTakes = {};
  for (const [k, raw] of Object.entries(d) as [AnthroSiteKey, [string, string, string]][]) {
    const nums = raw.map(parse).filter((n): n is number => n !== null);
    if (nums.length) out[k] = nums;
  }
  return out;
}

function SessionForm({
  patientId,
  initial,
  sex,
  birthDate,
  onClose,
  onSaved,
}: {
  patientId: string;
  initial: AnthropometrySessionDto | null;
  sex: "female" | "male" | null;
  birthDate: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [measuredAt, setMeasuredAt] = useState(initial?.measuredAt ?? new Date().toLocaleDateString("en-CA"));
  const [draft, setDraft] = useState<Draft>(initial ? toDraft(initial.takes) : {});
  const [kerrBlock, setKerrBlock] = useState(initial?.kerrBlock ?? false);
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const takes = useMemo(() => draftTakes(draft), [draft]);
  const preview = useMemo(
    () => anthropometryResults(takes, { sex, ageYears: ageAt(birthDate, measuredAt) }),
    [takes, sex, birthDate, measuredAt],
  );
  const sites = ANTHRO_SITES.filter((s) => kerrBlock || !s.kerr);

  function set(key: AnthroSiteKey, i: 0 | 1 | 2, v: string) {
    setDraft((d) => {
      const row = [...(d[key] ?? ["", "", ""])] as [string, string, string];
      row[i] = v;
      return { ...d, [key]: row };
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // La regla ISAK también la valida la API; acá se dice qué sitio falta.
    const lacking = sites.filter((site) => {
      const t = takes[site.key];
      return t && t.length === 2 && needsThirdTake(site.key, t);
    });
    if (lacking.length) {
      setErr(`Las tomas difieren y falta la tercera en: ${lacking.map((x) => x.label).join(", ")}.`);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      // Sin el bloque de Kerr, sus sitios no se mandan.
      const sent = Object.fromEntries(Object.entries(takes).filter(([k]) => kerrBlock || !ANTHRO_SITES.find((s) => s.key === k)!.kerr));
      await api(`patients/${patientId}/anthropometry${initial ? `/${initial.id}` : ""}`, {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measuredAt, takes: sent, note: note.trim() || null }),
      });
      await onSaved();
    } catch (e2) {
      setErr(errorMessage(e2));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? "Editar sesión de antropometría" : "Nueva sesión de antropometría"} className="sm:max-w-3xl">
      <form onSubmit={save} className="space-y-5">
        <div className="flex flex-wrap items-end gap-4">
          <Label label="Fecha de la medición">
            <Input type="date" value={measuredAt} onChange={(e) => setMeasuredAt(e.target.value)} required className="w-auto" />
          </Label>
          <label className="flex min-h-11 items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={kerrBlock} onChange={(e) => setKerrBlock(e.target.checked)} />
            Incluir el bloque de Kerr (fraccionamiento en 5 componentes)
          </label>
        </div>
        <p className="text-xs text-stone-500">
          Dos tomas por sitio. Si difieren más de 5% (pliegues) o 1% (el resto), se pide la tercera y se usa la mediana.
        </p>

        {GROUPS.map((g) => {
          const rows = sites.filter((s) => s.group === g.id);
          if (!rows.length) return null;
          return (
            <fieldset key={g.id}>
              <legend className="mb-2 text-sm font-medium text-stone-800">{g.label}</legend>
              <div className="space-y-2">
                {rows.map((site) => {
                  const raw = draft[site.key] ?? ["", "", ""];
                  const first2 = [parse(raw[0]), parse(raw[1])].filter((n): n is number => n !== null);
                  const third = needsThirdTake(site.key, first2);
                  const single = site.key === "bodyMass";
                  return (
                    <div key={site.key} className="grid grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)] items-center gap-2">
                      <span className="text-sm text-stone-700">
                        {site.label}
                        {site.kerr && <span className="ml-1 text-xs text-stone-400">(Kerr)</span>}
                      </span>
                      {[0, 1, 2].map((i) => {
                        const show = i === 0 || (i === 1 && !single) || (i === 2 && (third || raw[2] !== ""));
                        return show ? (
                          <Input
                            key={i}
                            inputMode="decimal"
                            value={raw[i]}
                            onChange={(e) => set(site.key, i as 0 | 1 | 2, e.target.value)}
                            aria-label={`${site.label}, toma ${i + 1}`}
                            className={cn("w-full px-2 text-right tabular-nums", i === 2 && third && raw[2] === "" && "border-amber-400")}
                            placeholder={i === 2 ? "3ª" : ""}
                          />
                        ) : (
                          <span key={i} />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <Label label="Nota (opcional)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="Pretemporada, post lesión…" />
        </Label>

        <div className="rounded-xl bg-stone-50 p-3 text-sm text-stone-700">
          <p className="font-medium">Vista previa</p>
          <p className="mt-1">
            Σ6 {fmt(val(preview.sum6))} mm · Σ8 {fmt(val(preview.sum8))} mm · % graso D-W {fmt(val(preview.fat.durninWomersley))}
            {(() => {
              const so = val(preview.somatotype);
              return so ? ` · Somatotipo ${fmt(so.endo)}-${fmt(so.meso)}-${fmt(so.ecto)}` : "";
            })()}
            {(() => {
              const k = val(preview.kerr);
              return k ? ` · Masa muscular ${fmt(k.muscleKg, 2)} kg` : "";
            })()}
          </p>
        </div>

        {err && <Alert>{err}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Guardando…" : "Guardar sesión"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** "15/10" a partir de "2026-10-15". */
function shortDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
