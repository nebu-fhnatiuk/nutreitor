# 0039 — Modo cancha: carga en el campo con dictado por voz

- **Estado**: aceptada
- **Fecha**: 2026-10-23
- **Jira**: KAN-74 (épica KAN-65)

## Contexto

La antropometría y la hidratación de un plantel se miden en el campo de
entrenamiento: de pie, con el plicómetro en una mano y el celular en la otra, al sol.
Las planillas (ADR 0031, ADR 0036) son tablas pensadas para la compu y el teclado.

## Decisión

- **Una vista de pantalla completa** (`components/field/field-mode.tsx`):
  - un sitio por vez, con el número enorme;
  - teclado numérico propio con botones grandes;
  - Anterior, micrófono y Siguiente abajo, al alcance del pulgar;
  - alto contraste, con un **modo sol** (fondo blanco y tinta negra) para leer con el sol de frente.
- **Se abre desde las planillas que ya existen:**
  - **Plantel, antropometría:** la pasada actual, deportista por deportista. Respeta la regla ISAK: la 3ª toma sólo donde las dos primeras difieren. Muestra la toma anterior y la diferencia.
  - **Plantel, hidratación:** "antes" (peso de todos) y "después" (peso, lo que tomó y lo que orinó, con el % perdido en vivo).
  - **Sesión individual:** toma 1 de todos los sitios, después la 2 y las terceras.
  - En los tres casos escribe en el **mismo borrador** de la planilla: el guardado, las validaciones y el borrador en el navegador no cambian.
- **Dictado por voz** con la Web Speech API del navegador (`es-AR`). El texto lo
  interpreta `parseSpokenMeasure` (shared, puro, con tests):
  - números en palabras o dígitos, decimales con "coma", "punto" o "con", y "y medio";
  - el sitio por su nombre, sin lo que va entre paréntesis, por su primera palabra si no es ambigua, o por alias.
  - Con sitio, salta a ese sitio del mismo deportista; sin sitio, carga el actual.
- **Sin servicio propio ni de terceros contratado.** Si el navegador no tiene
  reconocimiento de voz (Firefox), el micrófono queda deshabilitado y se usa el teclado.

## Privacidad

La app no manda audio a ningún lado, pero el motor de voz es del navegador: **Chrome
procesa el audio en servidores de Google** y Safari en los de Apple (o en el
dispositivo). Lo que se dicta es un sitio y un número, no datos que identifiquen al
deportista. La vista lo dice antes del primer uso. Si un club no lo acepta, el
teclado cubre todo.

## Alternativas descartadas

- **Un servicio de transcripción propio o contratado** (Whisper, Google STT). Suma
  costo, latencia en el campo con mala señal y un tratamiento de datos más.
- **Rediseñar las planillas para celular.** La tabla sigue siendo la mejor vista para
  revisar y corregir; el modo cancha es para cargar.

## Consecuencias

- El parser de números en español es la pieza más frágil: 21 tests cubren decimales,
  "y medio", centenas y miles, sitios ambiguos y alias.
- "Pantorrilla" sola se entiende como el perímetro (máxima); para el pliegue hay que
  decir "pantorrilla medial".
