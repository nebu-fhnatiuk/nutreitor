# 0041 — Consultas comerciales desde la landing ("Hablemos para tu club")

- **Estado**: aceptada
- **Fecha**: 2026-10-23
- **Jira**: KAN-80

## Contexto

La landing (ADR 0028) tiene un solo llamado a la acción: "Creá tu espacio", el alta
autoservicio (ADR 0025). Un club suele querer hablar antes de registrarse: cuántos
nutricionistas, qué ve la coordinación, cómo queda con sus colores. El contacto que ya
existe (ADR 0027) lleva a un visitante hacia un profesional **dentro** de una
organización; no sirve para escribirle a Nutreitor.

## Decisión

- **Formulario en la landing** (`/clubes#contacto`; la home lo enlaza desde la banda
  final). Pide nombre, email, club u organización, tipo, rol, rango de deportistas y un
  mensaje opcional, con consentimiento explícito para que lo contactemos. La usuaria lo
  eligió frente a un mailto, WhatsApp o un link de agenda.
- **Sin JavaScript**: la landing es estática (S3). El form hace un POST clásico a
  `/api/form/leads` (web, Next), que lo pasa a JSON hacia `POST /public/leads` (API) y
  responde 303 a `/clubes?consulta=enviada|revisar|espera|error#contacto`. En prod
  comparten `nutreitor.com` (CloudFront manda `/api/*` a la web); en dev la vuelta va a
  `SITE_URL`.
- **Plano de control**: tabla `sales_leads` sin tenant ni RLS, como `org_signups`. El rol
  app no tiene grants; la API la opera con la conexión owner. Valores acotados por
  CHECK y por los enums de `lead.dto.ts`.
- **Abuso**: rate limit de 5 cada 10 min por IP y 3 por hora por email; campo trampa
  (`website`) que, si viene lleno, descarta la consulta sin avisarle al bot (responde
  202 igual).
- **Seguimiento en la consola de plataforma**: pestaña "Consultas de clubes" con estado
  `new` → `contacted` → `closed` (y reabrir), y quién la marcó. El contacto en sí se hace
  por email, fuera de la app.
- **Avisos**: acuse a quien escribe y aviso a cada operador de plataforma (como el alta
  de una org). Ninguno repite el mensaje.

## Privacidad

No es un dato de salud: son datos de contacto de quien representa a una organización.
El formulario pide no incluir datos de salud en el mensaje. El consentimiento queda con
fecha (`consent_at`).

## Alternativas descartadas

- **mailto / WhatsApp / agenda**: sin seguimiento en la plataforma y dependientes de una
  cuenta personal.
- **`fetch` desde la landing a la API**: necesitaba CORS entre la landing y la web en
  dev, y no funciona sin JavaScript.
- **Reusar `contact_requests` (ADR 0027)**: es tenant-scoped y la ve un profesional; esto
  es de la plataforma.

## Consecuencias

- Hace falta una política de retención para `sales_leads` (se suma a KAN-24, export y
  borrado).
- Si el volumen crece, la consola necesitará filtros o exportar a un CRM.
