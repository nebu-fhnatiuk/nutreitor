# 0010 — Posicionamiento y marca de la landing de producto

- **Estado**: aceptada
- **Fecha**: 2026 (landing de producto)

## Contexto

La landing de producto (dominio raíz `nutreitor.com`) es la cara que **vende la
plataforma** a quien la va a contratar. Es distinta de la vidriera del profesional
(`{slug}.nutreitor.com`, Sprint 2). La landing previa era genérica ("plataforma
white-label para nutrición y organizaciones de salud"), ponía el multi-tenancy de
protagonista y listaba **agendamiento** como feature —que es un stub. Había que
fijar mensaje, público y marca antes de construir, para no volver a caer en lo
genérico ni prometer lo que no existe.

## Decisión

**Público primario:** el **nutricionista independiente** (muchas veces atiende
online). Las organizaciones (equipo, centro, club, clínica) aparecen como
**evolución**, nunca como protagonista.

**Idea central (paraguas de todo el mensaje):** *dejá de morir en lo
administrativo*. Nutreitor le devuelve tiempo y prolijidad al profesional —una sola
herramienta en vez de Excel + WhatsApp + apps sueltas. Eje: **agilidad**.

**Diferencial:** plataforma **específica para nutrición y deporte** (no app genérica
de salud ni CRM adaptado), que sirve a las **dos puntas** (el profesional gestiona,
el paciente tiene su portal) y acompaña **de lo chico a lo grande**.

**Transformación a comunicar:** de perder horas en lo administrativo y verse amateur
→ a una operación ágil y una imagen profesional.

**Tono:** cálido-pero-profesional, "vos" argentino, de colega a colega.

**Marca visual ("editorial cálido"):** lienzo crema (#FAF7F1), tinta casi-negra
cálida (#1C1B17), verde nutrición (esmeralda, el `brand` del producto) y acento
terracota/arcilla (#C9603A) para la calidez. Tipografía **Fraunces** (display serif
editorial) + **Figtree** (UI sans) —reusa el backbone tipográfico del producto.
Motivo recurrente: **antes/después** (caos disperso → operación ordenada).

**Honestidad de producto (límite duro):** sólo se vende lo construido (vidriera,
ficha, planes, seguimiento, portal). **Agendamiento e IA** van en una sección
discreta "Nutreitor evoluciona" como futuro, **sin afirmar que existen**. Sin
testimonios, logos ni métricas inventadas. Sin precios (CTA hacia "solicitar
acceso" / "ingresar al workspace").

## Consecuencias

- **A favor**: mensaje único y claro arriba del fold (agilidad / no más
  administrativo); marca propia y memorable, separada del white-label por tenant
  (tokens estáticos `cream`/`ink`/`clay`, no el `brand` var-driven); coherencia
  tipográfica con el resto del producto; cero riesgo de vender humo.
- **En contra / costos**: hablarle al independiente deja en segundo plano el discurso
  institucional (se asumió: es el público que mueve la aguja hoy); el CTA "Solicitar
  acceso" usa un `mailto` placeholder hasta que haya formulario/inbox real;
  mantener la disciplina de no listar agendamiento como feature obliga a revisar el
  copy cada vez que se sume algo.
- **Marca**: los tokens `cream`/`ink`/`clay` quedan en `tailwind.config` como marca
  de producto (no overridibles por tenant), separados del `brand` del white-label.

Implementación en [`apps/web/src/app/page.tsx`](../../apps/web/src/app/page.tsx).
