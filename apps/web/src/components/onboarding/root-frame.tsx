import type { ReactNode } from "react";

/**
 * Marco de las páginas del dominio raíz que no son la landing (alta, consola):
 * misma identidad "editorial cálido" de nutreitor.com, sin branding de tenant.
 */
export function RootFrame({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="border-b border-ink/10">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-4 sm:px-6">
          <a href="/" className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand" />
            <span className="font-serif text-xl font-medium tracking-tight">Nutreitor</span>
          </a>
        </div>
      </header>
      <main className={`mx-auto px-4 py-10 sm:px-6 sm:py-14 ${wide ? "max-w-6xl" : "max-w-xl"}`}>
        {children}
      </main>
    </div>
  );
}
