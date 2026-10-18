# 0021 — PWA white-label del portal, sin caché de datos

- **Estado**: aceptada
- **Fecha**: 2026-10-18

## Contexto

Fase 4.3: el paciente tiene que registrar sus comidas "a un toque", y eso pasa en el
celular. Una app nativa (dos stores, una por consultorio o una genérica) no encaja
con el white-label ni con el tamaño del equipo. Una **PWA** instalable desde el
navegador sí: cada consultorio aparece con su nombre, su color y su ícono.

La duda es cuánto offline: una PWA típica cachea páginas y datos para funcionar sin
conexión, pero el portal muestra **datos de salud** (plan, mediciones, ficha).

## Decisión

- **Manifest por tenant** (`app/manifest.ts`, por el header `x-tenant-slug`): nombre
  y color de marca del consultorio, `start_url: /app` (portal; sin sesión el
  middleware lleva al login).
- **Ícono por tenant** generado (`/pwa-icon/{180|192|512}`): inicial del consultorio
  sobre su color, centrada en la zona segura de los íconos *maskable*.
- **Service worker sin caché** (`public/sw.js`): todo va a la red; si una navegación
  falla por falta de conexión, muestra "Sin conexión · Reintentar". No guarda
  respuestas ni datos en el dispositivo.
- Invitación a instalar en el portal: diálogo nativo en Android/Chrome
  (`beforeinstallprompt`), instrucciones "Compartir → Agregar a inicio" en iPhone; se
  puede cerrar para siempre.

## Alternativas descartadas

- **Offline completo (cachear plan y registros)**: el plan quedaría legible en un
  dispositivo compartido o perdido, sin la sesión de por medio; y los registros
  offline exigen cola de sincronización y resolución de conflictos. Se puede revisar
  más adelante con cifrado y caducidad, si los pacientes lo piden.
- **Apps nativas**: costo y publicación por store incompatibles con el white-label hoy.

## Consecuencias

- Sin conexión, el portal no muestra nada (sólo el aviso). Registrar requiere red.
- Las notificaciones push (worker de 4.3) podrán usar este mismo service worker.
