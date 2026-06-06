import { cn } from "./cn";

/**
 * Switch accesible (role=switch) — único en el producto. Antes vivía sólo en la
 * ficha; portal y complementos usaban checkboxes crudos. Acento de marca en ON.
 */
export function Toggle({
  on,
  onChange,
  label,
  busy = false,
}: {
  on: boolean;
  onChange: () => void;
  /** Etiqueta accesible (aria-label); el control no lleva texto visible. */
  label: string;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50",
        on ? "bg-brand" : "bg-stone-300",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          on ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
