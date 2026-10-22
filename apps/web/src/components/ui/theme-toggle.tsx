"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const KEY = "nutreitor-mode";

/**
 * Claro/oscuro del workspace. Oscuro es el default del tema Estadio; la
 * preferencia vive en localStorage y app/layout.tsx la aplica antes de pintar.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [light, setLight] = useState(false);
  useEffect(() => setLight(document.documentElement.dataset.mode === "light"), []);

  function toggle() {
    const next = !light;
    setLight(next);
    if (next) document.documentElement.dataset.mode = "light";
    else delete document.documentElement.dataset.mode;
    try {
      if (next) localStorage.setItem(KEY, "light");
      else localStorage.removeItem(KEY);
    } catch {
      // Sin storage (modo privado): el cambio vale para esta pestaña.
    }
  }

  const Icon = light ? Moon : Sun;
  return (
    <button type="button" role="menuitem" onClick={toggle} className={className}>
      <Icon className="h-4 w-4" aria-hidden />
      {light ? "Modo oscuro" : "Modo claro"}
    </button>
  );
}
