# 0022 — Chat profesional ↔ paciente: append-only y con polling

- **Estado**: aceptada
- **Fecha**: 2026-10-18

## Contexto

Fase 4.3: el paciente necesita un canal directo con su equipo (hoy lo resuelven por
WhatsApp personal, fuera de la plataforma y sin registro). Decisiones: quiénes
participan, si los mensajes se editan, y cómo llegan "en vivo".

## Decisión

- **Una conversación por paciente**, con su equipo: la admin y los profesionales con
  asignación activa (mismo scoping que la ficha; 404 si no corresponde). El paciente
  escribe sólo si tiene un profesional asignado (si no, nadie lo leería).
- **Append-only**: `patient_messages` tiene GRANT sólo `SELECT` + `INSERT` (como las
  notas): es comunicación clínica, no se edita ni se borra. `message_reads` guarda
  hasta dónde leyó cada participante (contadores de no leídos).
- **Polling**: la conversación abierta consulta cada **10 s** con `after` (desde el
  último mensaje; el cliente deduplica por id) y sólo con la pestaña visible; el
  contador del menú, cada 60 s. Capacidades nuevas: `message:send` (admin,
  profesional) y `portal:message` (paciente).

## Alternativas descartadas

- **SSE**: instantáneo, pero exige conexiones largas a través del proxy de Next y el
  ALB, y pub/sub en Redis entre instancias. Se puede adoptar después sin cambiar el
  modelo (el contrato `after` sirve igual para reconectar).
- **WebSockets**: bidireccional, de más para un chat asíncrono de consultorio.

## Consecuencias

- Hasta 10 s de demora con la conversación abierta; fuera de ella, el paciente se
  entera al entrar (las notificaciones activas llegan con el worker de 4.3).
- Carga baja y predecible: una consulta indexada por conversación abierta cada 10 s.
