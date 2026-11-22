"use client";

import { ClipboardList, Droplets, FlaskConical, LayoutGrid, Pencil, Ruler, Table2, Trash2, UserCheck, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GroupAnthropometrySummaryDto, GroupBoardDto, GroupDetailDto, GroupSweatRowDto, PatientDto } from "@nutreitor/shared";

import { fmt, fmtMeasured, val } from "@/components/patients/anthro-format";
import { Alert, Button, Card, EmptyState, Input, Loading, Modal, PageHeader, SectionHeading, Select, buttonClass, cn, useFeedback } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

import { ApplyGroupPlan, AssignGroupProfessional } from "./group-actions";
import { GroupCoaches } from "./group-coaches";
import { GroupForm } from "./groups-view";
import { SquadBoard } from "./squad-board";
import { SquadSomatochart } from "./squad-somatochart";

type FatEq = "durninWomersley" | "yuhasz" | "faulkner";
const FAT_LABEL: Record<FatEq, string> = { durninWomersley: "D-W + Siri", yuhasz: "Yuhasz", faulkner: "Faulkner" };

/**
 * Un grupo. Abre en la **pizarra** (KAN-70): un semáforo por deportista ordenado por
 * quién necesita atención. La vista **tabla** mantiene el detalle para comparar
 * (somatotipo, Kerr, ecuación de % graso, plan de hidratación) y, para el admin,
 * sacar deportistas del grupo.
 */
export function GroupDetail({
  id,
  basePath,
  patientsPath,
  canManage,
  canRecord,
}: {
  id: string;
  basePath: string;
  patientsPath: string;
  canManage: boolean;
  canRecord: boolean;
}) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const [group, setGroup] = useState<GroupDetailDto | null>(null);
  const [summary, setSummary] = useState<GroupAnthropometrySummaryDto | null>(null);
  const [sweat, setSweat] = useState<GroupSweatRowDto[]>([]);
  const [board, setBoard] = useState<GroupBoardDto | null>(null);
  const [view, setView] = useState<"pizarra" | "tabla">("pizarra");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [eq, setEq] = useState<FatEq>("durninWomersley");

  const load = useCallback(async () => {
    try {
      const [g, s, h, b] = await Promise.all([
        api<GroupDetailDto>(`groups/${id}`),
        api<GroupAnthropometrySummaryDto>(`groups/${id}/anthropometry`),
        api<GroupSweatRowDto[]>(`groups/${id}/sweat-tests`).catch(() => []),
        api<GroupBoardDto>(`groups/${id}/board`).catch(() => null),
      ]);
      setGroup(g);
      setSummary(s);
      setSweat(h);
      setBoard(b);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function removeGroup() {
    if (!group) return;
    const ok = await confirm({
      title: `¿Borrar el grupo ${group.name}?`,
      body: "Los deportistas y sus datos no se tocan: sólo dejan de estar agrupados.",
      confirmLabel: "Borrar grupo",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api(`groups/${id}`, { method: "DELETE" });
      toast("Grupo borrado");
      router.push(basePath);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function removeMember(patientId: string, name: string) {
    const ok = await confirm({ title: `¿Sacar a ${name} del grupo?`, body: "Sus datos quedan en su ficha.", confirmLabel: "Sacar" });
    if (!ok) return;
    try {
      await api(`groups/${id}/members/${patientId}`, { method: "DELETE" });
      await load();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  if (error) return <Alert>{error}</Alert>;
  if (!group || !summary) return <Loading />;

  const measured = summary.rows.filter((r) => r.last).length;

  return (
    <>
      <PageHeader
        title={group.name}
        description={group.description ?? undefined}
        actions={
          <>
            {canRecord && group.members.length > 0 && (
              <Link href={`${basePath}/${id}/medir`} className={buttonClass("primary")}>
                <Ruler className="h-4 w-4" aria-hidden /> Medir plantel
              </Link>
            )}
            {canRecord && group.members.length > 0 && (
              <Link href={`${basePath}/${id}/hidratacion`} className={buttonClass("secondary")}>
                <Droplets className="h-4 w-4" aria-hidden /> Medir hidratación
              </Link>
            )}
            {canRecord && group.members.length > 0 && (
              <Button variant="secondary" onClick={() => setApplying(true)}>
                <ClipboardList className="h-4 w-4" aria-hidden /> Aplicar plan
              </Button>
            )}
            {canManage && group.members.length > 0 && (
              <Button variant="secondary" onClick={() => setAssigning(true)}>
                <UserCheck className="h-4 w-4" aria-hidden /> Asignar profesional
              </Button>
            )}
            {canManage && (
              <>
                <Button variant="secondary" onClick={() => setAdding(true)}>
                  <UserPlus className="h-4 w-4" aria-hidden /> Sumar deportistas
                </Button>
                <Button variant="ghost" onClick={() => setEditing(true)} aria-label="Editar grupo">
                  <Pencil className="h-4 w-4" aria-hidden />
                </Button>
                <Button variant="danger" onClick={removeGroup} aria-label="Borrar grupo">
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </>
            )}
          </>
        }
      />

      <AssignGroupProfessional
        groupId={id}
        members={group.members.length}
        open={assigning}
        onClose={() => setAssigning(false)}
        onDone={load}
      />
      <ApplyGroupPlan
        groupId={id}
        members={board?.coverage.members ?? group.members.length}
        withPlan={board?.coverage.withPlan ?? 0}
        open={applying}
        onClose={() => setApplying(false)}
        onDone={load}
      />

      {canManage && (
        <div className="mb-5">
          <GroupCoaches groupId={id} />
        </div>
      )}

      {board && group.members.length > 0 && (
        <div role="group" aria-label="Vista" className="mb-5 inline-flex rounded-xl border border-stone-200 bg-surface p-1">
          {(
            [
              ["pizarra", "Pizarra", LayoutGrid],
              ["tabla", "Tabla", Table2],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                "flex min-h-10 items-center gap-1.5 rounded-lg px-4 font-display text-sm font-semibold uppercase tracking-wider transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
                view === v ? "bg-stone-900 text-stone-50" : "text-stone-500 hover:text-stone-900",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}

      {board && group.members.length > 0 && view === "pizarra" ? (
        <div className="space-y-6">
          <SquadBoard board={board} patientsPath={patientsPath} />
          <SquadSomatochart rows={summary.rows} patientsPath={patientsPath} />
        </div>
      ) : (
        <>
        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
            <div>
              <SectionHeading>Antropometría del plantel</SectionHeading>
              <p className="mt-1 text-sm text-stone-500">
                {group.members.length === 0
                  ? "Sin deportistas."
                  : `Última medición de cada deportista · ${measured} de ${group.members.length} medidos.`}
              </p>
            </div>
            {measured > 0 && (
              <label className="flex items-center gap-2 text-sm text-stone-600">
                % graso
                <Select value={eq} onChange={(e) => setEq(e.target.value as FatEq)} className="w-auto py-1.5">
                  {(Object.keys(FAT_LABEL) as FatEq[]).map((k) => (
                    <option key={k} value={k}>
                      {FAT_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </label>
            )}
          </div>
          {!summary.validated && measured > 0 && (
            <p className="mx-5 mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
              Fórmulas en validación: usá los resultados como referencia.
            </p>
          )}

          {group.members.length === 0 ? (
            <div className="p-5">
              <EmptyState>
                {canManage ? "Sumá deportistas para medir al plantel completo." : "No tenés deportistas asignados en este grupo."}
              </EmptyState>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead>
                  <tr className="border-y border-stone-100 bg-stone-50 text-left text-xs text-stone-500">
                    <th className="px-5 py-2 font-medium">Deportista</th>
                    <th className="px-3 py-2 font-medium">Medición</th>
                    <th className="px-3 py-2 text-right font-medium">Masa (kg)</th>
                    <th className="px-3 py-2 text-right font-medium">Σ6 (mm)</th>
                    <th className="px-3 py-2 text-right font-medium">% graso</th>
                    <th className="px-3 py-2 text-right font-medium">Somatotipo</th>
                    <th className="px-3 py-2 text-right font-medium">Muscular (kg)</th>
                    {canManage && <th className="w-10 px-3 py-2" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {summary.rows.map((r) => {
                    const res = r.last?.results;
                    const so = res ? val(res.somatotype) : null;
                    const k = res ? val(res.kerr) : null;
                    return (
                      <tr key={r.patientId} className="hover:bg-stone-50">
                        <td className="px-5 py-2.5">
                          <Link href={`${patientsPath}/${r.patientId}`} className="font-medium text-stone-900 hover:text-brand">
                            {r.fullName}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-stone-600">{r.last ? fmtMeasured(r.last.measuredAt) : <span className="text-stone-400">Sin medir</span>}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{r.last ? fmt(r.last.bodyMass) : ""}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {res ? fmt(val(res.sum6)) : ""}
                          {r.sum6Delta !== null && r.sum6Delta !== 0 && (
                            <span className={cn("ml-1 text-xs", r.sum6Delta < 0 ? "text-emerald-700" : "text-amber-700")}>
                              {r.sum6Delta > 0 ? "+" : ""}
                              {fmt(r.sum6Delta)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{res ? fmt(val(res.fat[eq])) : ""}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{so ? `${fmt(so.endo)}-${fmt(so.meso)}-${fmt(so.ecto)}` : res ? "—" : ""}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{k ? fmt(k.muscleKg, 2) : res ? "—" : ""}</td>
                        {canManage && (
                          <td className="px-3 py-2.5 text-right">
                            <button
                              onClick={() => removeMember(r.patientId, r.fullName)}
                              aria-label={`Sacar a ${r.fullName} del grupo`}
                              className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-red-600"
                            >
                              <X className="h-4 w-4" aria-hidden />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="h-3" />
        </Card>

        {sweat.some((r) => r.last) && (
          <Card className="mt-6 p-0">
            <div className="px-5 pt-5">
              <SectionHeading>Hidratación del plantel</SectionHeading>
              <p className="mt-1 text-sm text-stone-500">Última prueba de sudoración de cada deportista.</p>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-y border-stone-100 bg-stone-50 text-left text-xs text-stone-500">
                    <th className="px-5 py-2 font-medium">Deportista</th>
                    <th className="px-3 py-2 font-medium">Prueba</th>
                    <th className="px-3 py-2 text-right font-medium">L/h</th>
                    <th className="px-3 py-2 text-right font-medium">Pérdida</th>
                    <th className="px-5 py-2 text-right font-medium">Tomar durante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {sweat.map((r) => (
                    <tr key={r.patientId}>
                      <td className="px-5 py-2.5">
                        <Link href={`${patientsPath}/${r.patientId}?tab=evaluar&sec=hidratacion`} className="font-medium text-stone-900 hover:text-brand">
                          {r.fullName}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-stone-600">
                        {r.last ? `${fmtMeasured(r.last.measuredOn)}${r.last.sessionLabel ? ` · ${r.last.sessionLabel}` : ""}` : <span className="text-stone-400">Sin medir</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.last ? fmt(r.last.results.sweatRateLh, 2) : ""}</td>
                      <td className={cn("px-3 py-2.5 text-right tabular-nums", r.last && r.last.results.dehydrationPct > 2 && "font-medium text-amber-700")}>
                        {r.last ? `${fmt(r.last.results.dehydrationPct)} %` : ""}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-stone-600">
                        {r.last ? (r.last.results.plan.duringMlPerHour > 0 ? `${r.last.results.plan.duringMlPerHour} ml/h` : "alcanza") : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="h-3" />
          </Card>
        )}
        </>
      )}

      {editing && (
        <GroupForm
          initial={group}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await load();
          }}
        />
      )}
      {adding && (
        <AddMembers
          group={group}
          onClose={() => setAdding(false)}
          onAdded={async () => {
            setAdding(false);
            await load();
          }}
        />
      )}
    </>
  );
}

/** Elegir deportistas del tenant que todavía no están en el grupo. */
function AddMembers({ group, onClose, onAdded }: { group: GroupDetailDto; onClose: () => void; onAdded: () => Promise<void> }) {
  const [patients, setPatients] = useState<PatientDto[] | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<PatientDto[]>("patients").then(setPatients, (e) => setErr(errorMessage(e)));
  }, []);

  const inGroup = useMemo(() => new Set(group.members.map((m) => m.patientId)), [group]);
  const options = (patients ?? []).filter(
    (p) => !inGroup.has(p.id) && p.fullName.toLowerCase().includes(q.trim().toLowerCase()),
  );

  function toggle(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api(`groups/${group.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientIds: [...picked] }),
      });
      await onAdded();
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Sumar a ${group.name}`}>
      <div className="space-y-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre" aria-label="Buscar deportista" />
        {patients === null ? (
          <Loading />
        ) : options.length === 0 ? (
          <p className="py-4 text-sm text-stone-500">{q ? "Sin resultados." : "Todos los deportistas ya están en el grupo."}</p>
        ) : (
          <ul className="max-h-80 divide-y divide-stone-100 overflow-y-auto rounded-lg border border-stone-200">
            {options.map((p) => (
              <li key={p.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-stone-50">
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                  <span className="flex-1 text-stone-800">{p.fullName}</span>
                  {p.groups.length > 0 && <span className="truncate text-xs text-stone-400">{p.groups.map((g) => g.name).join(", ")}</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
        {err && <Alert>{err}</Alert>}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy || picked.size === 0}>
            {busy ? "Sumando…" : picked.size > 0 ? `Sumar ${picked.size}` : "Sumar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
