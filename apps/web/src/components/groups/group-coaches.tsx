"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { GroupCoachDto, MemberDto } from "@nutreitor/shared";

import { Button, Card, SectionHeading, Select, useFeedback } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

/**
 * Cuerpo técnico del plantel (KAN-109): quién ve este grupo desde /equipo. Sólo lo
 * arma el admin. Se invita a la persona con el rol "Cuerpo técnico" en Miembros.
 */
export function GroupCoaches({ groupId }: { groupId: string }) {
  const { toast } = useFeedback();
  const [coaches, setCoaches] = useState<GroupCoachDto[]>([]);
  const [candidates, setCandidates] = useState<MemberDto[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [c, m] = await Promise.all([api<GroupCoachDto[]>(`groups/${groupId}/coaches`), api<MemberDto[]>("members")]);
    setCoaches(c);
    setCandidates(m.filter((x) => x.status === "active" && x.role === "coach" && !c.some((k) => k.membershipId === x.membershipId)));
  }, [groupId]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      await load();
      toast(ok);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionHeading>Cuerpo técnico</SectionHeading>
      <p className="mt-1 text-sm text-stone-500">
        Ven el semáforo del plantel (registro, cómo se sienten, peso e hidratación). Nunca la ficha, el plan ni los mensajes.
      </p>
      {coaches.length > 0 && (
        <ul className="mt-3 divide-y divide-stone-100">
          {coaches.map((c) => (
            <li key={c.membershipId} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-medium text-stone-900">{c.fullName}</span> <span className="text-stone-500">{c.email}</span>
              </span>
              <Button
                variant="ghost"
                disabled={busy}
                aria-label={`Quitar a ${c.fullName} del plantel`}
                onClick={() => void run(() => api(`groups/${groupId}/coaches/${c.membershipId}`, { method: "DELETE" }), "Quitado del plantel")}
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {candidates.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Sumar al cuerpo técnico" className="w-auto">
            <option value="">Sumar a…</option>
            {candidates.map((m) => (
              <option key={m.membershipId} value={m.membershipId}>
                {m.fullName}
              </option>
            ))}
          </Select>
          <Button
            disabled={busy || !pick}
            onClick={() =>
              void run(
                () =>
                  api(`groups/${groupId}/coaches`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ membershipId: pick }),
                  }).then(() => setPick("")),
                "Sumado al plantel",
              )
            }
          >
            Sumar
          </Button>
        </div>
      ) : (
        coaches.length === 0 && (
          <p className="mt-3 text-sm text-stone-500">Para sumar a alguien, invitalo en Miembros con el rol “Cuerpo técnico”.</p>
        )
      )}
    </Card>
  );
}
