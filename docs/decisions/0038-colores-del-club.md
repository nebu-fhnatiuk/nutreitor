# 0038 — Colores del club: paleta generada con contraste AA

- **Estado**: aceptada
- **Fecha**: 2026-10-23
- **Jira**: KAN-69 (épica KAN-65)

## Contexto

Cada organización elegía un solo color de marca (`brand_primary_color`), aplicado tal
cual como relleno y como texto. Para un club, los colores de la camiseta son un
argumento de venta, pero muchos no sirven como texto: el amarillo sobre blanco o el
azul marino sobre el grafito del tema Estadio ([ADR 0037](0037-tema-estadio.md)) no
llegan a 4.5:1. La columna `brand_secondary_color` ya existía y no se usaba.

## Decisión

- **Dos colores, una paleta.** `clubPalette(principal, segundo)` es una función pura
  en `packages/shared`. Para cada color calcula:
  - `fg`: el texto sobre su relleno (blanco o tinta, el de mayor contraste);
  - `onLight` / `onDark`: el tono más parecido que llega a 4.5:1 como **texto** sobre
    la superficie clara (#FFFFFF) u oscura (#121821). Si el color ya alcanza, queda
    igual; si no, se mezcla de a 5 % hacia tinta o blanco.
- **CSS vars por tenant.** El layout del tenant pone `--brand-*` y `--accent2-*`
  (base, fg, on-light, on-dark). En el tema Estadio, `.text-brand`, `.text-accent2`
  y las líneas de los gráficos (`stroke-brand`, `fill-brand`) usan el tono ajustado al
  modo. Los rellenos (`bg-brand`, `bg-accent2`) usan el color real: la camiseta se ve
  tal cual.
- **Vista previa en la configuración.** Muestra la miniatura del workspace en oscuro y
  en claro con estilos en línea, para que no dependa del modo actual. También muestra
  las seis verificaciones de contraste, cuál usa un tono ajustado, y avisa si los dos
  colores casi no se distinguen.
- **Sin colores cargados**, la paleta usa los de Nutreitor (verde #107A57 y naranja
  #F28C28): mismos valores que los defaults de `globals.css`.

## Alternativas descartadas

- **Rechazar los colores que no pasan AA.** El club no elige sus colores: hay que
  aceptarlos y adaptar el uso.
- **`color-mix` en CSS** (lo que hacía ADR 0037 en oscuro). Es una mezcla fija, del 55 %:
  no garantiza 4.5:1 con cualquier color y no se puede mostrar el ratio en la vista
  previa.
- **Generar una escala completa (50–950) por color.** Es más de lo que el tema usa hoy;
  se puede sumar si aparece la necesidad.

## Consecuencias

- La regla de contraste vive en un solo lugar y tiene tests (valores de referencia
  WCAG, amarillo, azul marino).
- Un tono ajustado puede verse distinto al de la camiseta como texto; la vista previa
  lo marca ("se usa un tono ajustado").
- El texto sobre el relleno puede no llegar a AA con algunos tonos medios (ni blanco ni
  tinta alcanzan). La vista previa lo muestra como aviso; no se bloquea.
