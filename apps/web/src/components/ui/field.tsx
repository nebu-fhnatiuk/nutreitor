import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cn } from "./cn";

/**
 * Estilo único de campo de formulario. Antes este string se reimplementaba en ~18
 * pantallas. `w-full` por defecto; se puede sobrescribir con `className` (ej. el
 * input del chat usa `flex-1`).
 */
export const fieldClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none " +
  "placeholder:text-stone-400 focus:border-brand focus:ring-2 focus:ring-brand/20 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClass, className)} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldClass, className)} {...rest}>
      {children}
    </select>
  );
}

/** Etiqueta + control. Unifica el patrón `<label><span/>…</label>` repetido en forms. */
export function Label({
  label,
  hint,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={cn("block", wide && "sm:col-span-2")}>
      <span className="mb-1 block text-xs text-stone-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-400">{hint}</span>}
    </label>
  );
}
