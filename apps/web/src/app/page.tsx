import type { Metadata } from "next";

import { EnterWorkspace } from "@/components/enter-workspace";

/**
 * Landing de PRODUCTO (dominio raíz nutreitor.com). Le habla al nutricionista
 * independiente; idea central: dejá de morir en lo administrativo (agilidad).
 * Dirección visual "editorial cálido": crema + tinta + verde nutrición + arcilla,
 * Fraunces display + Figtree. SSG indexable (server component).
 *
 * NO vende features inexistentes: agendamiento e IA viven en "hacia dónde vamos"
 * como futuro, nunca como construido. La vidriera del profesional vive aparte
 * ({slug}.nutreitor.com); acá sólo se vende la plataforma.
 */

export const metadata: Metadata = {
  title: "Nutreitor — dejá de morir en lo administrativo",
  description:
    "La plataforma para nutricionistas: captá, planificá y seguí a tus pacientes desde un solo lugar. Específica para nutrición y deporte. Vos, a lo tuyo.",
  openGraph: {
    title: "Nutreitor — una sola herramienta para tu práctica",
    description:
      "Vidriera, fichas, planes y seguimiento en un solo lugar. Hecha para el nutricionista independiente.",
    type: "website",
  },
};

const PAINS = [
  "Planes en Word y Excel que rehacés casi de cero para cada paciente.",
  "El seguimiento vive en WhatsApp y se pierde entre una consulta y la otra.",
  "Tus datos, repartidos en cinco apps que no se hablan entre sí.",
  "Coordinar horarios —y husos, si atendés online— te come la agenda.",
  "Una imagen que no está a la altura de cómo trabajás en serio.",
];

const CAPABILITIES = [
  {
    n: "01",
    title: "Tu vidriera profesional",
    desc: "Un perfil público para que te encuentren y te contacten, con tu nombre, tus servicios y tus credenciales.",
  },
  {
    n: "02",
    title: "La ficha de cada paciente, ordenada",
    desc: "Antecedentes, objetivos y datos clínicos en un solo lugar —no en cinco planillas distintas.",
  },
  {
    n: "03",
    title: "Planes alimentarios en minutos",
    desc: "Con horarios, cantidades y alternativas. Los revisás cuando hace falta y queda el historial de versiones.",
  },
  {
    n: "04",
    title: "Seguimiento real entre consultas",
    desc: "Peso, medidas y evolución en gráficos claros. Ves el progreso del paciente, no lo intuís.",
  },
  {
    n: "05",
    title: "El portal de tu paciente",
    desc: "Tu paciente tiene su propio espacio: su plan, su evolución, su autorreporte. Vos te ves profesional.",
  },
];

const DIFERENCIAL = [
  {
    title: "Específico para nutrición y deporte",
    desc: "No es una app genérica de salud ni un CRM adaptado a los ponchazos. Está pensada para cómo trabajás vos.",
  },
  {
    title: "Sirve a las dos puntas",
    desc: "Vos gestionás del lado profesional; tu paciente tiene su propio espacio. Una herramienta, dos experiencias.",
  },
  {
    title: "De lo chico a lo grande",
    desc: "Arrancás solo y la herramienta no te pesa. El mismo producto te acompaña cuando sumás equipo o sede.",
  },
];

export default function MarketingHome() {
  return (
    <div className="min-h-screen scroll-smooth bg-cream paper-grain text-ink">
      <Nav />
      <Hero />
      <Problema />
      <ComoFunciona />
      <Diferencial />
      <ParaQuien />
      <Futuro />
      <CtaFinal />
      <Footer />
    </div>
  );
}

// ── Nav ─────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-ink/5 bg-cream/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#top" className="flex items-center gap-2">
          <Mark />
          <span className="font-serif text-xl font-medium tracking-tight">Nutreitor</span>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-ink/60 md:flex">
          <a href="#como-funciona" className="transition hover:text-ink">Cómo funciona</a>
          <a href="#diferencial" className="transition hover:text-ink">Por qué Nutreitor</a>
          <a href="#para-quien" className="transition hover:text-ink">Para quién</a>
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="#ingresar"
            className="hidden rounded-full px-3 py-2 text-sm text-ink/60 transition hover:text-ink sm:inline"
          >
            Ingresar
          </a>
          <a
            href="#probar"
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-cream transition hover:bg-ink/85"
          >
            Probar Nutreitor
          </a>
        </div>
      </div>
    </header>
  );
}

/** Sello: cuadro verde nutrición + halo arcilla. Logotipo mínimo y propio. */
function Mark() {
  return (
    <span className="relative inline-flex h-6 w-6 items-center justify-center">
      <span className="absolute inset-0 rounded-[7px] bg-brand" />
      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-clay" />
      <span className="relative font-serif text-sm font-semibold leading-none text-brand-fg">N</span>
    </span>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section id="top" className="hero-wash">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:pb-28 lg:pt-24">
        <div className="stagger">
          <span className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-cream px-3 py-1 text-xs font-medium text-ink/60">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            Software para nutrición y deporte
          </span>
          <h1 className="mt-6 font-serif text-[2.6rem] font-medium leading-[1.04] tracking-tight sm:text-6xl">
            Dejá de morir en{" "}
            <span className="relative whitespace-nowrap text-brand">
              lo administrativo
              <Underline />
            </span>
            .
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-ink/70">
            Captá, planificá y seguí a tus pacientes desde un solo lugar. Nutreitor
            se ocupa de lo de alrededor para que vos hagas lo tuyo:{" "}
            <span className="text-ink">la nutrición</span>.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href="#probar"
              className="rounded-full bg-clay px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              Probar Nutreitor
            </a>
            <a
              href="#como-funciona"
              className="rounded-full border border-ink/15 px-6 py-3 text-sm font-medium text-ink transition hover:border-ink/30"
            >
              Ver cómo funciona
            </a>
          </div>
          <p className="mt-5 text-sm text-ink/45">
            ¿Ya operás con Nutreitor?{" "}
            <a href="#ingresar" className="text-ink/70 underline-offset-4 hover:underline">
              Entrá a tu workspace
            </a>
            .
          </p>
        </div>

        <BeforeAfter />
      </div>
    </section>
  );
}

/** Subrayado dibujado a mano (arcilla) bajo el acento del titular. */
function Underline() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 300 12"
      preserveAspectRatio="none"
      className="absolute -bottom-1 left-0 h-2.5 w-full text-clay"
    >
      <path
        d="M2 8 C 80 2, 150 2, 298 6"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Motivo antes/después: el caos disperso → la operación ordenada. Ilustrativo,
 * sin screenshots ni datos inventados. */
function BeforeAfter() {
  const chaos = ["Excel.xlsx", "WhatsApp", "plan_final_v3.docx", "Agenda.pdf", "Fotos", "Mail"];
  const order = ["Vidriera", "Ficha clínica", "Plan alimentario", "Evolución", "Portal del paciente"];
  return (
    <div className="relative">
      {/* Antes */}
      <div className="rotate-[-1.5deg] rounded-2xl border border-ink/10 bg-cream/70 p-5 shadow-sm">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-ink/40">Hoy</p>
        <div className="flex flex-wrap gap-2">
          {chaos.map((c, i) => (
            <span
              key={c}
              className="rounded-md border border-ink/10 bg-white px-2.5 py-1 text-xs text-ink/50"
              style={{ transform: `rotate(${(i % 2 ? 1 : -1) * (1 + (i % 3))}deg)` }}
            >
              {c}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink/40">Seis lugares, ninguno hablándose.</p>
      </div>

      {/* Después */}
      <div className="relative z-10 mt-[-1.25rem] ml-auto w-[88%] rotate-[1deg] rounded-2xl border border-brand/20 bg-white p-5 shadow-xl shadow-ink/5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-widest text-brand">Con Nutreitor</p>
          <Mark />
        </div>
        <ul className="space-y-1.5">
          {order.map((o) => (
            <li key={o} className="flex items-center gap-2 rounded-lg bg-cream/60 px-3 py-2 text-sm text-ink">
              <Check />
              {o}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink/45">Todo en uno. Y tu paciente, adentro.</p>
      </div>
    </div>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-brand" aria-hidden>
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Problema ───────────────────────────────────────────────────────────────────

function Problema() {
  return (
    <section className="border-t border-ink/5 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-sm font-medium uppercase tracking-widest text-clay">¿Te suena?</p>
        <h2 className="mt-3 max-w-2xl font-serif text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
          El conocimiento es tuyo. El problema es todo lo de alrededor.
        </h2>
        <ul className="mt-10 grid gap-x-10 gap-y-px sm:grid-cols-2">
          {PAINS.map((p, i) => (
            <li
              key={p}
              className="flex items-start gap-4 border-b border-ink/[0.08] py-5 text-ink/75"
            >
              <span className="mt-0.5 font-serif text-sm text-ink/30">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-[1.05rem] leading-snug">{p}</span>
            </li>
          ))}
          <li className="flex items-center py-5">
            <span className="font-serif text-lg italic text-ink/80">
              Y al final del día, menos tiempo para lo que importa.
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}

// ── Cómo funciona ────────────────────────────────────────────────────────────

function ComoFunciona() {
  return (
    <section id="como-funciona" className="scroll-mt-20 bg-ink py-20 text-cream sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-sm font-medium uppercase tracking-widest text-clay-soft">Cómo funciona</p>
        <h2 className="mt-3 max-w-2xl font-serif text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
          Una sola herramienta, de la captación al seguimiento.
        </h2>
        <p className="mt-4 max-w-xl text-cream/60">
          Todo lo que ya hace Nutreitor, ordenado bajo una idea: que vos ganes
          tiempo y te veas profesional.
        </p>

        <div className="mt-12 divide-y divide-cream/10 border-y border-cream/10">
          {CAPABILITIES.map((c) => (
            <div
              key={c.n}
              className="grid items-baseline gap-2 py-6 sm:grid-cols-[auto_1fr] sm:gap-8"
            >
              <span className="font-serif text-2xl text-clay-soft">{c.n}</span>
              <div className="sm:flex sm:items-baseline sm:justify-between sm:gap-10">
                <h3 className="font-serif text-xl font-medium text-cream sm:w-72 sm:shrink-0">
                  {c.title}
                </h3>
                <p className="mt-1 max-w-xl text-cream/65 sm:mt-0">{c.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Diferencial ────────────────────────────────────────────────────────────────

function Diferencial() {
  return (
    <section id="diferencial" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-sm font-medium uppercase tracking-widest text-clay">Por qué Nutreitor</p>
        <h2 className="mt-3 max-w-2xl font-serif text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
          No es un CRM adaptado a los ponchazos.
        </h2>
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-ink/10 bg-ink/10 sm:grid-cols-3">
          {DIFERENCIAL.map((d) => (
            <div key={d.title} className="bg-cream p-7">
              <h3 className="font-serif text-xl font-medium text-ink">{d.title}</h3>
              <p className="mt-3 leading-relaxed text-ink/65">{d.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Para quién es ──────────────────────────────────────────────────────────────

function ParaQuien() {
  const growth = ["Independiente", "Equipo", "Centro", "Club", "Clínica"];
  return (
    <section id="para-quien" className="scroll-mt-20 border-t border-ink/5 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-end">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-clay">Para quién es</p>
            <h2 className="mt-3 font-serif text-3xl font-medium leading-tight tracking-tight sm:text-5xl">
              Hecha para el nutricionista{" "}
              <span className="text-brand">independiente</span>.
            </h2>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink/70">
              Y cuando crezcas, crece con vos: sumás a tu equipo, tu centro, tu club
              o tu clínica —la misma herramienta, sin migrar a otra cosa.
            </p>
          </div>
          <ol className="flex flex-wrap items-center gap-2 lg:justify-end">
            {growth.map((g, i) => (
              <li key={g} className="flex items-center gap-2">
                <span
                  className={
                    i === 0
                      ? "rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-brand-fg"
                      : "rounded-full border border-ink/15 px-4 py-1.5 text-sm text-ink/55"
                  }
                >
                  {g}
                </span>
                {i < growth.length - 1 && <span className="text-ink/25" aria-hidden>→</span>}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

// ── Hacia dónde vamos (futuro, sin afirmar que existe) ──────────────────────────

function Futuro() {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="rounded-2xl border border-dashed border-ink/15 bg-cream px-7 py-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-serif text-xl font-medium text-ink">Nutreitor evoluciona</h2>
            <span className="text-xs uppercase tracking-widest text-ink/40">en camino</span>
          </div>
          <p className="mt-3 max-w-2xl leading-relaxed text-ink/65">
            Estamos trabajando en <span className="text-ink">agendamiento integrado</span> y en
            asistencia inteligente para armar y ajustar planes aún más rápido. Lo
            vamos a contar cuando esté listo —no antes. Lo de hoy ya funciona.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── CTA final ──────────────────────────────────────────────────────────────────

function CtaFinal() {
  return (
    <section id="probar" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h2 className="mx-auto max-w-2xl font-serif text-3xl font-medium leading-tight tracking-tight sm:text-5xl">
          De morir en lo administrativo a una práctica{" "}
          <span className="text-brand">ágil y profesional</span>.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-ink/70">
          Tu próxima consulta puede ser distinta. Pedí acceso y empezá a trabajar
          con todo en un solo lugar.
        </p>
        <div className="mt-9 flex justify-center">
          {/* DEUDA (prod): destino temporal de dev. En producción esto va a un
              formulario / inbox de captación real (CRM, Typeform, etc.), no a un
              mail personal. Ver ADR 0010 (CTA hacia "solicitar acceso"). */}
          <a
            href="mailto:flopi.hnatiuk@gmail.com?subject=Quiero%20probar%20Nutreitor&body=Hola%2C%20me%20interesa%20probar%20Nutreitor."
            className="rounded-full bg-clay px-7 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            Solicitar acceso
          </a>
        </div>

        <div
          id="ingresar"
          className="mx-auto mt-16 max-w-xl scroll-mt-24 rounded-3xl border border-ink/10 bg-white p-8 text-left shadow-sm"
        >
          <h3 className="font-serif text-xl font-medium text-ink">¿Ya operás con Nutreitor?</h3>
          <p className="mt-1.5 text-sm text-ink/55">
            Cada organización tiene su propio subdominio. Escribí el tuyo para ir a
            tu login. (Demo: probá <span className="text-brand">demo</span>.)
          </p>
          <div className="mt-5">
            <EnterWorkspace />
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-ink/10">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-10 text-sm text-ink/45 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Mark />
          <span className="font-serif text-base text-ink/70">Nutreitor</span>
        </div>
        <p>Una sola herramienta para captar, planificar y seguir. © 2026.</p>
      </div>
    </footer>
  );
}
