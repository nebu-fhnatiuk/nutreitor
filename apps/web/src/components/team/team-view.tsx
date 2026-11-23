"use client";

import { useEffect, useState } from "react";
import type { TeamBoardDto, TeamGroupDto } from "@nutreitor/shared";

import { Alert, EmptyState, Loading, PageHeader, Select } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

import { TeamBoard } from "./team-board";

/**
 * Vista del cuerpo técnico (KAN-109): con un plantel entra directo; con varios, se
 * elige arriba. Sólo lectura y sin links a la ficha: lo clínico queda con la
 * nutricionista.
 */
export function TeamView() {
  const [groups, setGroups] = useState<TeamGroupDto[] | null>(null);
  const [groupId, setGroupId] = useState("");
  const [board, setBoard] = useState<TeamBoardDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<TeamGroupDto[]>("team/groups")
      .then((g) => {
        setGroups(g);
        setGroupId((cur) => cur || g[0]?.id || "");
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(() => {
    if (!groupId) return;
    let alive = true;
    setBoard(null);
    api<TeamBoardDto>(`team/groups/${groupId}/board`)
      .then((b) => alive && setBoard(b))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [groupId]);

  if (error) return <Alert>{error}</Alert>;
  if (!groups) return <Loading />;
  if (groups.length === 0) {
    return (
      <>
        <PageHeader title="Equipo" />
        <EmptyState>Todavía no tenés planteles asignados. Pedíselo a la coordinación del club.</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={board?.group.name ?? "Equipo"}
        description="Cómo vienen los jugadores: registro de comidas, cómo se sienten, peso e hidratación."
        actions={
          groups.length > 1 ? (
            <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Plantel" className="w-auto">
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.members})
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />
      {board ? <TeamBoard board={board} /> : <Loading />}
    </>
  );
}
