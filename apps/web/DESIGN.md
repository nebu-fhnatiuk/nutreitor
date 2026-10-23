# Sistema visual — Nutreitor

Un solo hilo conductor para TODA la app (captación pública + workspace + login/landing):
**claro, cálido, editorial, accesible**. Basado en la skill `ui-ux-pro-max`
(estilo "Accessible & Ethical" para healthcare: alto contraste, tipografía clara,
sin oscuro/neón en superficies públicas).

## Tema Estadio (workspace autenticado, ADR 0037)

Todo lo que vive dentro de `WorkspaceShell` usa el tema **Estadio**: oscuro de
transmisión por defecto (con opción de claro en el menú de usuario), UI en **Barlow**,
cifras y rótulos en **Barlow Condensed** (`font-display`, `tabular-nums`).

- **Las clases `stone-*`, `red-*`, `amber-*`, `emerald-*` y `sky-*` se siguen usando igual.**
  Son var-driven y se invierten solas en oscuro: `stone-50` es fondo, `stone-200` borde,
  `stone-500` texto atenuado, `stone-900` tinta.
- **Superficie:** `bg-surface` (nunca `bg-white` para tarjetas o paneles).
- **Zonas:** `ZoneBadge`, `ZoneMark`, `zoneText`, `zoneFill` y `zoneSoft` (de
  `components/ui`). Nunca color solo: siempre forma + texto.
- **Cifras:** `Stat` (rótulo condensado + número grande + unidad chica).
- **Club:** `brand` (color principal) + `accent2` (segundo color), cargados en
  Configuración → Marca. La paleta sale de `clubPalette` (ADR 0038): rellenos con el
  color real y `text-*-fg` encima; como texto o línea de gráfico, el tema usa el tono
  ajustado a AA del modo (`--brand-on-dark-rgb`…). No pintes texto con `style` y el
  color crudo.
- **Scrims:** `bg-black/30..40` (no `stone-900`, que en oscuro es claro).
- **Imágenes para compartir** ("Tu mes en números", ADR 0040): canvas 1080×1920,
  siempre en oscuro, con los colores del club leídos de las variables del tenant
  (`--brand-rgb`, `--accent2-on-dark-rgb`…) y las fuentes por su `font-family`
  computada. Sólo hábitos, nunca medidas corporales.

- **Acceso** (KAN-77): `AuthShell` y sus piezas (`AuthHeading`, `AuthField`,
  `PasswordField` con botón para mostrarla, `AuthButton` de 54 px, `AuthNotice` con
  forma de zona). Escudo = logo del club o `clubInitials`; franjas diagonales con
  `brand` + `accent2`. En el celular las franjas terminan arriba del título.

- **Consola de plataforma** (KAN-87): sin sesión, el login va en `AuthShell` con la
  marca de Nutreitor; con sesión, `ConsoleShell` (topbar con quién opera,
  claro/oscuro y salir). Los estados (alta, matrícula, consulta) son chips con la
  forma de la zona: en revisión/nueva = límite, activa/revisada/contactada = en
  rango, rechazada/suspendida = fuera; sin zona = neutro.

La landing (`apps/site`, KAN-78) usa la dirección "Día de partido": claro, Barlow
Condensed en mayúsculas y bandas con los colores del club (ADR 0028). La vidriera
sigue con la identidad de abajo.

## Tokens (superficies públicas)

- **Superficie:** página `bg-stone-50` (crema), tarjetas `bg-white` con
  `border-stone-200` + `shadow-sm`, radios `rounded-2xl` (tarjetas) / `rounded-lg`
  (inputs/botones).
- **Tinta:** títulos `text-stone-900`, cuerpo `text-stone-600/700`, atenuado
  `text-stone-500`, sutil `text-stone-400`.
- **Marca (white-label por tenant):** `--brand-rgb` (default emerald profundo
  `16 122 87`) + `--brand-fg-rgb` (texto sobre relleno de marca, default blanco).
  Usar `bg-brand`/`text-brand-fg` en rellenos, `text-brand` y `bg-brand/10..15` en
  acentos. El color lo sobrescribe la org en runtime (ver `lib/tenant-theme`).
- **Tipografía:** display serif **Fraunces** (`font-serif`) para títulos de página
  y heros; UI/cuerpo sans **Figtree** (`font-sans`, default del body). Cargadas con
  `next/font` en `app/layout.tsx`.
- **Estados:** foco visible `focus:border-brand focus:ring-2 focus:ring-brand/20`
  (a11y); hover con transición `transition` 150–300ms; error `border-red-200
  bg-red-50 text-red-700`.

## Reglas (de la skill)

- Iconos SVG (no emojis). Ver `CalendarIcon` en `components/public/booking-cta.tsx`.
- `cursor-pointer` + feedback de hover en todo lo clickeable.
- Contraste mínimo 4.5:1; `prefers-reduced-motion` respetado (ver `globals.css`).
- Responsive mobile-first (375 / 768 / 1024 / 1440).

## Dónde vive

- `app/globals.css` — base (superficie, fuente, reduced-motion, `.brand-wash`).
- `tailwind.config.ts` — `colors.brand`, `fontFamily.serif/sans`.
- `app/layout.tsx` — carga de fuentes + inyección de marca.
- Público: `components/public/*` (claro/editorial). Workspace: `components/*` +
  `workspace-shell.tsx` (Estadio). Acceso: `components/auth/auth-shell.tsx` (Estadio).
  Consola: `components/onboarding/platform-console.tsx` (Estadio).
