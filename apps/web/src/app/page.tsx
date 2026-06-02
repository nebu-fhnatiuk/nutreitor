import { EnterWorkspace } from "@/components/enter-workspace";

/** Segmentos a los que apunta el producto. */
const SEGMENTS = [
  "Nutricionistas",
  "Gimnasios",
  "Clubes",
  "Consultorios",
  "Clínicas",
  "Hospitales",
];

const FEATURES = [
  {
    title: "Capa pública por profesional",
    desc: "Perfil indexable con servicios y credenciales, en tu propio subdominio.",
  },
  {
    title: "Agendamiento",
    desc: "Reserva de citas con manejo de husos horarios y DST por país.",
  },
  {
    title: "Dashboards paciente y profesional",
    desc: "Planes, progreso y seguimiento por paciente, en un solo lugar.",
  },
  {
    title: "Multi-tenant white-label",
    desc: "Tu marca, tu dominio, tus datos aislados. Una plataforma, muchas organizaciones.",
  },
];

export default function MarketingHome() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand shadow-[0_0_12px_rgb(var(--brand-rgb))]" />
          <span className="text-lg font-semibold tracking-tight">Nutreitor</span>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-zinc-400 sm:flex">
          <span className="cursor-default transition hover:text-zinc-100">Producto</span>
          <span className="cursor-default transition hover:text-zinc-100">Segmentos</span>
          <span className="cursor-default transition hover:text-zinc-100">Precios</span>
        </nav>
        <a
          href="#ingresar"
          className="rounded-full border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-600"
        >
          Ingresar
        </a>
      </header>

      {/* Hero */}
      <section className="brand-glow">
        <div className="mx-auto max-w-3xl px-6 pb-16 pt-16 text-center sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            Plataforma SaaS white-label para nutrición
          </span>
          <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
            La plataforma para captar y seguir
            <br />
            <span className="text-brand">a tus pacientes.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-zinc-400">
            Captación, agendamiento, planes y seguimiento — con tu marca y tus
            datos aislados. Para nutricionistas y organizaciones de salud y deporte.
          </p>
          <div className="mt-9 flex items-center justify-center gap-3">
            <a
              href="#ingresar"
              className="rounded-full bg-brand px-6 py-3 text-sm font-medium text-brand-fg transition hover:brightness-110"
            >
              Solicitar demo
            </a>
            <a
              href="#ingresar"
              className="rounded-full border border-zinc-800 px-6 py-3 text-sm font-medium text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-900"
            >
              Ingresar a mi workspace
            </a>
          </div>
        </div>
      </section>

      {/* Para quién es */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <h2 className="text-center text-sm font-medium uppercase tracking-widest text-zinc-500">
          Para quién es
        </h2>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {SEGMENTS.map((s) => (
            <span
              key={s}
              className="rounded-full border border-zinc-800 bg-zinc-900/40 px-4 py-1.5 text-sm text-zinc-300"
            >
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 transition hover:border-brand/50 hover:bg-zinc-900"
            >
              <div className="mb-4 h-9 w-9 rounded-lg border border-zinc-700 bg-zinc-950 transition group-hover:border-brand/60" />
              <h3 className="font-semibold text-zinc-100">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Ingresar */}
      <section id="ingresar" className="mx-auto max-w-6xl px-6 pb-24">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-10 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Ingresá a tu workspace</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
            Cada organización tiene su propio subdominio. Escribí el tuyo para ir a
            tu login. (Demo: probá <span className="text-brand">demo</span>.)
          </p>
          <div className="mt-6 flex justify-center">
            <EnterWorkspace />
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-900">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-zinc-600">
          © 2026 Nutreitor — plataforma multi-tenant white-label.
        </div>
      </footer>
    </div>
  );
}
