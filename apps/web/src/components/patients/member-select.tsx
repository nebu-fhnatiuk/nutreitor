"use client";

import { useEffect, useState } from "react";
import type { MemberDto } from "@nutreitor/shared";

import { api } from "@/lib/api";

const SELECT_CLS =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

/**
 * Selector de profesional asignable (miembros activos, no-paciente). Único lugar
 * que define "quién es asignable" para no divergir entre el alta y la reasignación.
 */
export function MemberSelect({
  value,
  onChange,
  emptyLabel = "Elegir…",
}: {
  value: string;
  onChange: (membershipId: string) => void;
  emptyLabel?: string;
}) {
  const [members, setMembers] = useState<MemberDto[]>([]);

  useEffect(() => {
    let alive = true;
    api<MemberDto[]>("members")
      .then((m) => {
        if (alive) {
          setMembers(m.filter((x) => x.status === "active" && x.role !== "patient"));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={SELECT_CLS}>
      <option value="">{emptyLabel}</option>
      {members.map((m) => (
        <option key={m.membershipId} value={m.membershipId}>
          {m.fullName} ({m.role})
        </option>
      ))}
    </select>
  );
}
