"use client";

import { Mail, Phone } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  AcceptContactResult,
  ContactRequestDto,
  ContactRequestStatus,
  MemberDto,
} from "@nutreitor/shared";

import {
  Alert,
  Button,
  Card,
  EmptyState,
  Label,
  Loading,
  Modal,
  Select,
  Tabs,
  Textarea,
  tabPanelProps,
  useFeedback,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { fmtDateTime } from "@/lib/datetime";

import { CONTACT_CHANGED_EVENT } from "./use-new-requests";

/**
 * Bandeja de solicitudes de contacto (ADR 0027). Cada una la ve sólo su
 * destinatario. `team`: la admin de un equipo, que además puede asignar a un
 * profesional las consultas del consultorio o derivarlas.
 */
export function ContactInbox({
  basePatientsPath,
  team,
}: {
  basePatientsPath: string;
  team: boolean;
}) {
  const [tab, setTab] = useState<ContactRequestStatus>("new");
  const [rows, setRows] = useState<ContactRequestDto[] | null>(null);
  const [pros, setPros] = useState<MemberDto[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    try {
      setRows(await api<ContactRequestDto[]>(`contact-requests?status=${tab}`));
    } catch (e) {
      setErr(errorMessage(e));
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!team) return;
    api<MemberDto[]>("members")
      .then((ms) => setPros(ms.filter((m) => m.status === "active" && m.role !== "patient")))
      .catch(() => setPros([]));
  }, [team]);

  const changed = async () => {
    window.dispatchEvent(new Event(CONTACT_CHANGED_EVENT));
    await load();
  };

  return (
    <div>
      <Tabs<ContactRequestStatus>
        label="Estado de las solicitudes"
        value={tab}
        onChange={setTab}
        items={[
          { id: "new", label: "Nuevas" },
          { id: "accepted", label: "Aceptadas" },
          { id: "declined", label: "Rechazadas" },
        ]}
      />
      <div {...tabPanelProps(tab)} className="mt-6">
        {err && <Alert>{err}</Alert>}
        {rows === null ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState>
            {tab === "new"
              ? "No hay consultas nuevas. Llegan desde tu vidriera, del botón “Escribile una consulta”."
              : "Nada por acá."}
          </EmptyState>
        ) : (
          <ul className="space-y-4">
            {rows.map((r) => (
              <li key={r.id}>
                <RequestCard req={r} team={team} pros={pros} basePatientsPath={basePatientsPath} onChanged={changed} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function RequestCard({
  req,
  team,
  pros,
  basePatientsPath,
  onChanged,
}: {
  req: ContactRequestDto;
  team: boolean;
  pros: MemberDto[];
  basePatientsPath: string;
  onChanged: () => Promise<void>;
}) {
  const { toast } = useFeedback();
  const [dialog, setDialog] = useState<"accept" | "decline" | "forward" | null>(null);
  const [assignTo, setAssignTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toOrg = req.membershipId === null;
  // La admin de un equipo elige a quién asignar las del consultorio.
  const mustChoose = team && toOrg;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      setDialog(null);
      await onChanged();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const accept = () =>
    run(async () => {
      const r = await api<AcceptContactResult>(`contact-requests/${req.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mustChoose ? { assignToMembershipId: assignTo, invite: true } : { invite: true }),
      });
      toast(
        r.invited
          ? `Creamos la ficha de ${req.fullName} y le mandamos la invitación al portal.`
          : `Creamos la ficha de ${req.fullName}. La invitación no salió: ${r.inviteError ?? "probá desde la ficha"}.`,
        r.invited ? "success" : "error",
      );
    });

  const decline = () =>
    run(async () => {
      await api(`contact-requests/${req.id}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(note.trim() ? { note: note.trim() } : {}),
      });
      toast("Solicitud rechazada. Le avisamos con un mail amable.");
    });

  const forward = () =>
    run(async () => {
      await api(`contact-requests/${req.id}/forward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: assignTo }),
      });
      toast("Consulta derivada.");
    });

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-stone-900">{req.fullName}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-stone-500">
            <a href={`mailto:${req.email}`} className="inline-flex items-center gap-1 break-all hover:text-brand">
              <Mail className="h-3.5 w-3.5" aria-hidden /> {req.email}
            </a>
            {req.phone && (
              <a href={`tel:${req.phone}`} className="inline-flex items-center gap-1 hover:text-brand">
                <Phone className="h-3.5 w-3.5" aria-hidden /> {req.phone}
              </a>
            )}
          </p>
        </div>
        <div className="text-right text-xs text-stone-500">
          <p>{fmtDateTime(req.createdAt)}</p>
          {team && <p className="mt-0.5">{toOrg ? "Para el consultorio" : `Para ${req.recipientName ?? "—"}`}</p>}
        </div>
      </div>

      <p className="mt-3 whitespace-pre-line rounded-xl bg-stone-50 p-3 text-sm text-stone-700">{req.message}</p>

      {req.status !== "new" && (
        <p className="mt-3 text-sm text-stone-500">
          {req.status === "accepted" ? "Aceptada" : "Rechazada"}
          {req.decidedByName ? ` por ${req.decidedByName}` : ""}
          {req.decidedAt ? ` el ${fmtDateTime(req.decidedAt)}` : ""}.
          {req.patientId && (
            <>
              {" "}
              <Link href={`${basePatientsPath}/${req.patientId}`} className="text-brand underline-offset-4 hover:underline">
                Ver ficha
              </Link>
            </>
          )}
          {req.decisionNote && <span className="mt-1 block">Nota interna: {req.decisionNote}</span>}
        </p>
      )}

      {err && <div className="mt-3"><Alert>{err}</Alert></div>}

      {req.status === "new" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => (mustChoose ? setDialog("accept") : accept())}>
            Aceptar y crear ficha
          </Button>
          {mustChoose && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setDialog("forward")}>
              Derivar a un profesional
            </Button>
          )}
          <Button size="sm" variant="danger" disabled={busy} onClick={() => setDialog("decline")}>
            Rechazar
          </Button>
        </div>
      )}

      <Modal
        open={dialog === "accept" || dialog === "forward"}
        onClose={() => setDialog(null)}
        title={dialog === "accept" ? `Aceptar a ${req.fullName}` : `Derivar la consulta de ${req.fullName}`}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void (dialog === "accept" ? accept() : forward());
          }}
        >
          <Label
            label={dialog === "accept" ? "Asignar la ficha a" : "Derivar a"}
            hint={
              dialog === "accept"
                ? "Creamos la ficha asignada y le mandamos la invitación al portal."
                : "La consulta pasa a la bandeja de ese profesional y deja de verse acá."
            }
          >
            <Select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} required>
              <option value="">Elegí…</option>
              {pros.map((p) => (
                <option key={p.membershipId} value={p.membershipId}>
                  {p.fullName}
                </option>
              ))}
            </Select>
          </Label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || !assignTo}>
              {dialog === "accept" ? "Aceptar" : "Derivar"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={dialog === "decline"} onClose={() => setDialog(null)} title={`Rechazar la consulta de ${req.fullName}`}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void decline();
          }}
        >
          <p className="text-sm text-stone-600">
            Le mandamos un mail amable diciendo que por ahora no pueden tomar su consulta.
          </p>
          <Label label="Nota interna (opcional)" hint="No se le manda: queda sólo para el equipo.">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} />
          </Label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              Rechazar
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
