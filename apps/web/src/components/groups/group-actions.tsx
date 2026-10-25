"use client";

import { useEffect, useState } from "react";
import type {
  ApplyGroupPlanResultDto,
  AssignGroupProfessionalResultDto,
  PlanTemplateDto,
} from "@nutreitor/shared";

import { MemberSelect } from "@/components/patients/member-select";
import { Alert, Button, Input, Label, Loading, Modal, Select, useFeedback } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Asignar un profesional a todo el grupo (KAN-32). Se suma a quien no lo tenga; no
 * le saca a nadie el profesional que ya tenía. Todo o nada.
 */
export function AssignGroupProfessional({
  groupId,
  members,
  open,
  onClose,
  onDone,
}: {
  groupId: string;
  members: number;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useFeedback();
  const [membershipId, setMembershipId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<AssignGroupProfessionalResultDto>(`groups/${groupId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId }),
      });
      toast(
        r.assigned
          ? `Listo: ${plural(r.assigned, "deportista asignado", "deportistas asignados")}${r.alreadyAssigned ? ` (${r.alreadyAssigned} ya lo tenían)` : ""}.`
          : "Todos ya tenían ese profesional.",
      );
      setMembershipId("");
      onDone();
      onClose();
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Asignar un profesional a todo el grupo">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-stone-600">
          Se asigna a los {plural(members, "deportista", "deportistas")} del grupo que todavía no lo tengan. Quien ya tiene otro
          profesional lo sigue teniendo.
        </p>
        <Label label="Profesional">
          <MemberSelect value={membershipId} onChange={setMembershipId} />
        </Label>
        {err && <Alert>{err}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !membershipId}>
            {busy ? "Asignando…" : "Asignar a todos"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Aplicar una plantilla a todo el grupo (KAN-33): cada deportista recibe su propio
 * plan (copia de la plantilla) que después se ajusta en su ficha.
 */
export function ApplyGroupPlan({
  groupId,
  members,
  withPlan,
  open,
  onClose,
  onDone,
}: {
  groupId: string;
  /** Deportistas que la sesión ve en el grupo. */
  members: number;
  /** De esos, cuántos ya tienen un plan vigente. */
  withPlan: number;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useFeedback();
  const [templates, setTemplates] = useState<PlanTemplateDto[] | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [onlyWithoutPlan, setOnlyWithoutPlan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || templates) return;
    api<PlanTemplateDto[]>("plan-templates")
      .then(setTemplates)
      .catch((e) => setErr(errorMessage(e)));
  }, [open, templates]);

  const template = templates?.find((t) => t.id === templateId);
  const receiving = onlyWithoutPlan ? members - withPlan : members;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<ApplyGroupPlanResultDto>(`groups/${groupId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, title: title.trim() || null, startDate: startDate || null, onlyWithoutPlan }),
      });
      toast(
        r.applied
          ? `Listo: ${plural(r.applied, "deportista recibió", "deportistas recibieron")} el plan${r.replaced ? ` (${r.replaced} reemplazado${r.replaced === 1 ? "" : "s"}, quedan en el historial)` : ""}.`
          : "Nadie recibió el plan: todos ya tenían uno.",
      );
      onDone();
      onClose();
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Aplicar un plan a todo el grupo">
      {templates === null && !err ? (
        <Loading />
      ) : templates && templates.length === 0 ? (
        <p className="text-sm text-stone-600">
          Todavía no hay plantillas. Armá un plan en la ficha de un deportista y guardalo como plantilla.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-stone-600">
            Cada deportista recibe su propio plan, copiado de la plantilla. Después lo ajustás en su ficha sin tocar a los demás.
          </p>
          <Label label="Plantilla">
            <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
              <option value="">Elegir…</option>
              {(templates ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Label label="Título del plan" hint="Si lo dejás vacío, el de la plantilla.">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={template?.name ?? ""} maxLength={200} />
            </Label>
            <Label label="Desde (opcional)">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Label>
          </div>
          {withPlan > 0 && (
            <label className="flex min-h-11 items-start gap-3 rounded-xl border border-stone-200 px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={onlyWithoutPlan}
                onChange={(e) => setOnlyWithoutPlan(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand"
              />
              <span>
                <span className="font-medium">Sólo a quienes no tienen plan</span>
                <span className="block text-stone-500">
                  {plural(withPlan, "deportista ya tiene", "deportistas ya tienen")} un plan vigente. Si no marcás esto, se reemplaza
                  (la versión anterior queda en su historial).
                </span>
              </span>
            </label>
          )}
          {err && <Alert>{err}</Alert>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || !templateId || receiving === 0}>
              {busy ? "Aplicando…" : `Aplicar a ${plural(receiving, "deportista", "deportistas")}`}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
