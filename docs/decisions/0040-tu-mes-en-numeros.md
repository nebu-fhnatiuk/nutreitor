# 0040 — "Tu mes en números": el reporte mensual como historia para compartir

- **Estado**: aceptada (la lista de qué entra queda a validar por la nutricionista)
- **Fecha**: 2026-10-23
- **Jira**: KAN-76 (épica KAN-65)

## Contexto

El reporte mensual publicado (flujo `docs/flows/reports.md`) se lee en el portal y se
imprime. Los deportistas comparten sus logros en Instagram. Una imagen del mes, con
los colores del club, sirve de motivación y muestra el trabajo del cuerpo técnico.
Pero sale de la plataforma y queda pública.

## Decisión

- **Sólo hábitos, nunca el cuerpo.** `storyContent` (shared, puro, con tests) elige
  de los números del reporte, en este orden:
  - % del plan cumplido (el número grande);
  - días con registro;
  - la mejor racha de días seguidos (desde 2);
  - consultas realizadas;
  - energía promedio (1–5).

  Quedan afuera siempre: **peso, % grasa, cintura**, el plan y su título, los turnos
  cancelados y **el comentario del profesional**. Publicar una medida corporal en
  redes puede empujar comparaciones y conductas de riesgo; el comentario es una
  conversación privada.
- **Sólo reportes publicados.** Un borrador no tiene historia, y un mes sin registros
  ni consultas tampoco: no se ofrece una imagen vacía.
- **La racha** (`adherence.longestStreak`) se agrega a los datos del reporte. Los
  publicados antes no la tienen y no se recalculan (foto fija): la historia la omite.
- **Se dibuja en el navegador** (canvas 1080×1920) con la paleta del club (ADR 0038)
  leída de las variables CSS del tenant y las fuentes Estadio (ADR 0037). Fondo
  siempre oscuro, estilo transmisión. Sin servicio de imágenes ni datos que salgan
  del dispositivo hasta que el deportista decide compartir.
- **Compartir**: en el celular, la hoja de compartir del sistema (Web Share API con
  archivo), que lleva directo a Instagram; si no está, se descarga el PNG.
- **Sólo en el portal del deportista**: es su logro y su decisión de publicarlo.

## Alternativas descartadas

- **Generar la imagen en el servidor** (Satori, Puppeteer). Suma infraestructura y
  un endpoint que arma imágenes con datos de salud; el navegador ya tiene todo.
- **Que el profesional elija qué números van.** Más configuración para un caso que
  hoy no lo pide; la lista fija y conservadora evita que un descuido publique una
  medida.
- **El escudo real del club.** El logo es una URL externa: dibujarlo "ensucia" el
  canvas (CORS) y no se puede exportar. Se usan las iniciales con los dos colores,
  como en la vista previa de la marca.

## Consecuencias

- La historia no muestra la evolución corporal, que es lo que más se pidió en el
  ticket. Si se quiere sumar, va con un consentimiento explícito del deportista.
- Firefox de escritorio no tiene compartir con archivo: queda el botón Descargar.
