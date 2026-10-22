"use client";

import { Plus, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { GroupDetailDto, GroupDto } from "@nutreitor/shared";

import { Alert, Button, Card, EmptyState, Input, Label, Loading, Modal, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

/**
 * Grupos de deportistas (ADR 0031): planteles, divisiones o turnos. El admin los arma
 * (`canManage`); el profesional los ve con sus deportistas asignados.
 */
export function GroupsView({ basePath, canManage }: { basePath: string; canManage: boolean }) {
  const [groups, setGroups] = useState<GroupDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setGroups(await api<GroupDto[]>("groups"));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      {canManage && (
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Nuevo grupo
        </Button>
      )}
      {error && <Alert>{error}</Alert>}
      {groups === null && !error ? (
        <Loading />
      ) : groups && groups.length === 0 ? (
        <Card>
          <EmptyState>
            {canManage
              ? "Todavía no hay grupos. Armá uno por plantel, división o turno para medir y seguir a todos juntos."
              : "Todavía no hay grupos. Los arma la administración de la organización."}
          </EmptyState>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups?.map((g) => (
            <li key={g.id}>
              <Link
                href={`${basePath}/${g.id}`}
                className="block h-full rounded-2xl border border-stone-200 bg-surface p-5 shadow-sm transition hover:border-brand/40"
              >
                <p className="font-medium text-stone-900">{g.name}</p>
                {g.description && <p className="mt-1 line-clamp-2 text-sm text-stone-500">{g.description}</p>}
                <p className="mt-3 flex items-center gap-1.5 text-sm text-stone-600">
                  <Users className="h-4 w-4 text-stone-400" aria-hidden />
                  {g.memberCount === 1 ? "1 deportista" : `${g.memberCount} deportistas`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <GroupForm
          initial={null}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

/** Alta / edición del nombre y la descripción. */
export function GroupForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: GroupDto | null;
  onClose: () => void;
  onSaved: (g: GroupDetailDto) => Promise<void> | void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const g = await api<GroupDetailDto>(initial ? `groups/${initial.id}` : "groups", {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
      });
      await onSaved(g);
    } catch (e2) {
      setErr(errorMessage(e2));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? "Editar grupo" : "Nuevo grupo"}>
      <form onSubmit={submit} className="space-y-4">
        <Label label="Nombre">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="Primera división, Sub-17, Turno mañana…" autoFocus />
        </Label>
        <Label label="Descripción (opcional)">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={300} />
        </Label>
        {err && <Alert>{err}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? "Guardando…" : initial ? "Guardar" : "Crear grupo"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
