"use client";

import { useEffect, useState } from "react";
import type { MemberDto } from "@nutreitor/shared";

import { api } from "@/lib/api";
import { Select } from "@/components/ui";

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
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {members.map((m) => (
        <option key={m.membershipId} value={m.membershipId}>
          {m.fullName} ({m.role})
        </option>
      ))}
    </Select>
  );
}
