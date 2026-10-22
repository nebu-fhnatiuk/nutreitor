# 0037 — Tema Estadio: tokens, modo oscuro y colores por zona

- **Estado**: aceptada
- **Fecha**: 2026-10-22
- **Jira**: KAN-67 (épica KAN-65, dirección elegida en KAN-66)

## Contexto

El rediseño (KAN-65) eligió la dirección **Estadio**: oscuro de transmisión deportiva,
cifras grandes en condensada y estados por zona (en rango, en el límite, fuera). La web
tenía unas 900 clases `stone-*` y 66 `bg-white` escritas a mano en 120 componentes, más
rojos/ámbar/verdes para estados. Reescribir pantalla por pantalla era caro y frágil.

## Decisión

- **Escalas var-driven.** En `tailwind.config.ts`, `stone`, `red`, `amber`, `emerald` y
  `sky` leen cada tono de una CSS var (`--stone-200`, …). En `:root` los valores son
  idénticos a la paleta de Tailwind: las superficies públicas (landing, vidriera, login)
  no cambian.
- **Inversión en oscuro.** Dentro de `[data-theme="estadio"]` las escalas se invierten
  (`stone-50` = fondo grafito, `stone-900` = tinta clara). Las clases existentes siguen
  significando lo mismo ("fondo", "borde", "texto atenuado") sin tocar los componentes.
- **Alcance.** `WorkspaceShell` (todo destino autenticado: profesional, admin y portal
  del deportista) es la raíz del tema. Los overlays se montan dentro de esa raíz, no en
  `<body>`, para heredar las variables.
- **Tokens nuevos:**
  - `surface`: tarjetas y paneles; reemplaza a `bg-white`.
  - `zone.ok`, `zone.warn`, `zone.bad`.
  - `accent2`: segundo color del club; por defecto naranja, lo personaliza KAN-69.
  - `font-display`: Barlow Condensed para cifras y rótulos.
- **Tipografía.** En el tema, la UI usa Barlow y `font-serif` se redirige a Barlow
  Condensed. Los `h1` de página van en mayúscula, como un zócalo de TV.
- **Zonas accesibles.** `ZoneBadge` / `ZoneMark` siempre combinan color, forma y texto.
  La forma es rombo para en rango, cuadrado para en el límite y círculo para fuera.
  `Stat` es la cifra de marcador.
- **Claro/oscuro.** Oscuro es el default. La preferencia vive en `localStorage`
  (`nutreitor-mode`) y un script inline en `app/layout.tsx` la aplica antes de pintar,
  así no parpadea. El modo claro mantiene la tipografía de marcador.
- **Impresión.** El oscuro aplica sólo en `@media screen`: los informes salen en claro.
- **White-label.** `--brand-rgb` del tenant sigue intacto. Como texto sobre grafito se
  aclara con `color-mix` (los tenants suelen elegir tonos oscuros) para llegar a 4.5:1.
  Los rellenos `bg-brand` no cambian.

## Consecuencias

- Una clase de color nueva fuera de esas cinco escalas (p. ej. `violet`) no se invierte.
  Hay que agregarla a la escala var-driven o usar los tokens semánticos.
- `bg-white` queda sólo para lo que debe ser blanco en ambos modos (perilla del switch,
  chips sobre relleno de marca); las superficies usan `bg-surface`.
- La preferencia es por navegador, no por usuario: alcanza para empezar. Si se pide que
  viaje entre dispositivos, se guarda en el perfil.
- Cambiar `tailwind.config.ts` requiere reiniciar `web` en desarrollo.
