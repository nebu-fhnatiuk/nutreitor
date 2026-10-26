import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * Encabezado único de las pantallas del workspace: título serif + bajada opcional +
 * acciones a la derecha (en mobile bajan debajo). Antes cada página lo armaba a
 * mano con tamaños distintos (text-2xl / text-3xl) y un kicker que repetía la nav.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        // flex-wrap: si las acciones no entran al lado del título, bajan a otra línea
        // (antes el título se achicaba hasta quedar tapado por los botones).
        "mb-8 flex flex-wrap items-end justify-between gap-4",
        className,
      )}
    >
      <div className="min-w-0 flex-[1_1_18rem]">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-stone-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
