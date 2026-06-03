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
        <nav className="hidden items-center gap-8 text-sm text-stone-500 sm:flex">
          <span className="cursor-default transition hover:text-stone-900">Producto</span>
          <span className="cursor-default transition hover:text-stone-900">Segmentos</span>
          <span className="cursor-default transition hover:text-stone-900">Precios</span>
        </nav>
        <a
          href="#ingresar"
          className="rounded-full border border-stone-200 px-4 py-2 text-sm font-medium text-stone-800 transition hover:border-stone-300"
        >
          Ingresar
        </a>
      </header>

      {/* Hero */}
      <section className="brand-wash">
        <div className="mx-auto max-w-3xl px-6 pb-16 pt-16 text-center sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-500">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            Plataforma SaaS white-label para nutrición
          </span>
          <h1 className="mt-6 font-serif text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
            La plataforma para captar y seguir
            <br />
            <span className="text-brand">a tus pacientes.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-stone-500">
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
              className="rounded-full border border-stone-200 px-6 py-3 text-sm font-medium text-stone-800 transition hover:border-stone-300 hover:bg-stone-100"
            >
              Ingresar a mi workspace
            </a>
          </div>
        </div>
      </section>

      {/* Para quién es */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <h2 className="text-center text-sm font-medium uppercase tracking-widest text-stone-500">
          Para quién es
        </h2>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {SEGMENTS.map((s) => (
            <span
              key={s}
              className="rounded-full border border-stone-200 bg-white px-4 py-1.5 text-sm text-stone-700"
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
              className="group rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
            >
              <div className="mb-4 h-9 w-9 rounded-lg bg-brand/10 transition group-hover:bg-brand/20" />
              <h3 className="font-semibold text-stone-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Ingresar */}
      <section id="ingresar" className="mx-auto max-w-6xl px-6 pb-24">
        <div className="rounded-3xl border border-stone-200 bg-white p-10 text-center">
          <h2 className="font-serif text-2xl font-semibold tracking-tight">Ingresá a tu workspace</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-stone-500">
            Cada organización tiene su propio subdominio. Escribí el tuyo para ir a
            tu login. (Demo: probá <span className="text-brand">demo</span>.)
          </p>
          <div className="mt-6 flex justify-center">
            <EnterWorkspace />
          </div>
        </div>
      </section>

      <footer className="border-t border-stone-200">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-stone-400">
          © 2026 Nutreitor — plataforma multi-tenant white-label.
        </div>
      </footer>
    </div>
  );
}
