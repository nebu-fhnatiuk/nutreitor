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
        "mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-stone-600">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
