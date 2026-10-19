# 0027 — Solicitud de contacto desde la vidriera

- **Estado**: aceptada
- **Fecha**: 2026-10-19

## Contexto

Desde la vidriera solo se podía reservar un turno. Hay pacientes que antes de
reservar quieren preguntar algo, y a veces escriben al consultorio sin saber con quién
atenderse. La decisión de producto fue resolverlo **en la vidriera de cada
organización**, sin un directorio entre organizaciones (eso sería un marketplace y la
primera lectura entre tenants).

## Decisión

- **Formulario público** (`POST /public/orgs/{slug}/contact`, sin sesión): nombre,
  email, teléfono opcional, motivo (10–1000 caracteres) y **consentimiento
  explícito** para usar esos datos con este fin (Ley 25.326). Va a un profesional
  (`profileSlug`) o al consultorio. Solo para orgs activas y perfiles con matrícula
  revisada (el mismo filtro que el resto de la vidriera). Tiene rate-limit por IP y por
  email, y un honeypot: si llega completo, se responde OK y no se guarda nada.
- **La ve solo el destinatario** (mismo criterio que el chat, ADR 0024):
  - dirigida a un profesional, la ve ese profesional (o la admin, si es ella la
    del perfil);
  - dirigida al consultorio, la ven las admins, que pueden **derivarla** a un
    profesional. Una vez derivada, deja de aparecerles.
  - La admin de un equipo **no** ve las consultas dirigidas a un profesional.
- **Aceptar**: en una transacción se crea la ficha con los datos de contacto y el
  motivo como "motivo de consulta", se asigna (a quien acepta; en una consulta al
  consultorio, la admin elige; en una org individual, es ella) y se cierra la
  solicitud. Después, fuera de la transacción, se invita al portal. Si la invitación
  falla (por ejemplo, porque el email ya es miembro), la ficha queda y se informa.
  Es la única vía por la que un profesional da de alta un paciente; por eso la
  capacidad es propia: `contact:respond`.
- **Nunca se ata a una ficha existente** desde la ruta pública. Un email no prueba
  identidad, el mismo criterio que la reserva pública. Los duplicados se reconcilian
  a mano.
- **Rechazar**: la nota queda **interna**; al visitante le llega un mail amable
  genérico.
- **Avisos** (worker, ADR 0023): `contact_request`. Le avisa al destinatario sin el
  contenido. El acuse al visitante tampoco repite lo que escribió.
- **Sin DELETE** (por GRANT): la bandeja guarda la historia. La retención queda para
  Fase 3.

## Alternativas descartadas

- **Directorio público entre orgs** (marketplace): más captación, pero es la primera
  lectura cross-tenant y requiere moderación. Queda para más adelante.
- **Cuenta de paciente primero**: suma fricción a quien solo quiere preguntar.
- **Que la admin vea todas las consultas**: el motivo puede ser de salud. Se
  priorizó la privacidad por destinatario, como en el chat.
- **Mandarle al visitante la nota del rechazo**: riesgo de que se filtre algo interno.

## Consecuencias

- Las solicitudes guardan datos personales y un motivo que puede ser de salud, sin
  vencimiento todavía: entran en la política de retención de Fase 3.
- Un visitante que ya es paciente genera una ficha nueva si lo aceptan; se resuelve
  a mano (igual que con los leads de la reserva pública).
