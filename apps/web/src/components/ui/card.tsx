import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * Tarjeta de superficie del workspace. Token único (antes el mismo string vivía
 * inline en ~8 pantallas): crema/blanco, borde stone, redondeo 2xl, sombra sutil.
 */
export function Card({
  children,
  className,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag className={cn("rounded-2xl border border-stone-200 bg-surface p-5 shadow-sm", className)}>
      {children}
    </Tag>
  );
}

/**
 * Encabezado de sección (kicker en mayúsculas). Token único: antes repetido en
 * ~12 pantallas con `text-xs font-semibold uppercase tracking-widest text-stone-500`.
 */
export function SectionHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2 className={cn("font-display text-sm font-semibold uppercase tracking-widest text-stone-500", className)}>
      {children}
    </h2>
  );
}
