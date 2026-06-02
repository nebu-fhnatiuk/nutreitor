"use client";

import { useState } from "react";

/**
 * Caja "Ingresar": el usuario escribe el slug de su organización y lo llevamos a
 * su subdominio ({slug}.<host>/login). En dev, `demo` → demo.localhost:3000/login.
 */
export function EnterWorkspace() {
  const [slug, setSlug] = useState("");

  function go(e: React.FormEvent) {
    e.preventDefault();
    const s = slug.trim().toLowerCase();
    if (!s) return;
    const { protocol, host } = window.location;
    window.location.assign(`${protocol}//${s}.${host}/login`);
  }

  return (
    <form onSubmit={go} className="flex w-full max-w-md items-center gap-2">
      <div className="flex flex-1 items-center rounded-full border border-zinc-800 bg-zinc-900/60 pl-4 pr-2 focus-within:border-brand/60">
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="tu-organizacion"
          className="flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-zinc-600"
        />
        <span className="text-sm text-zinc-600">.nutreitor.com</span>
      </div>
      <button
        type="submit"
        className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-fg transition hover:brightness-110"
      >
        Ingresar
      </button>
    </form>
  );
}
