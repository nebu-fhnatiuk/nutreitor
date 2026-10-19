# 0026 — Profesional independiente: una org de una persona

- **Estado**: aceptada
- **Fecha**: 2026-10-18

## Contexto

ADR 0025 sumó el alta autoservicio con dos tipos de cuenta: `team` e `individual`.
Toda la plataforma estaba pensada para un equipo: la admin administra y los
profesionales atienden. Un nutricionista independiente es las dos cosas a la vez, y
con los roles tal cual quedaba en un panel de administración sin agenda propia, sin
chat con sus pacientes y sin sus números.

## Decisión

- **Mismo modelo de datos**: una org `individual` con una sola membresía `admin`.
  Nada se migra si después suma colegas. Se descartó un rol nuevo o un profesional
  sin tenant (rompería RLS y las capacidades).
- **"Atiende" ≠ rol**: `actsAsProfessional(role, kind)` es verdadero para el
  profesional y para la admin de una org individual. Decide la **UI** (menú, inicio,
  páginas `/pro`); los **permisos** siguen saliendo de las capacidades del rol.
- **Inicio y menú**: el independiente entra a `/pro` ("Hoy"). Su menú es el del
  profesional más Página pública y Configuración; no hay Miembros ni roster. Las
  páginas `/admin` de trabajo (inicio, pacientes, mensajes, miembros) redirigen a su
  equivalente. La checklist de primeros pasos aparece en "Hoy".
- **Sus pacientes**: al crear un paciente en una org individual queda asignado a
  quien lo crea (no hay a quién más asignarlo).
- **Chat clínico (refina ADR 0024)**: en una conversación paciente ↔ profesional
  participa **la membresía asignada**, tenga el rol que tenga. Así la independiente
  chatea con sus pacientes. La privacidad de 0024 no cambia: una admin de equipo
  sigue sin ver las conversaciones de los profesionales; sólo ve las suyas si ella
  misma está asignada a un paciente.
- **Eficiencia**: cuenta como "quien atiende" a los profesionales y a las admins con
  pacientes asignados. `mine=true` devuelve sólo la fila propia ("Tus números").
- **Pasar a equipo**: explícito, desde Configuración (`PUT
  /organizations/current/kind`). En una org individual, invitar a un colega
  responde 409 con esa indicación. Volver a independiente sólo si no quedan colegas
  activos ni invitaciones de equipo pendientes. `kind` se suma al GRANT por columna
  del rol app (el estado sigue siendo sólo de la plataforma).

## Alternativas descartadas

- **Rol `owner`/`solo` nuevo**: duplica capacidades y cada chequeo de rol.
- **Membresía `professional` + capacidades de admin**: mezcla los roles y rompe el
  "último admin" y la curaduría.
- **Pasar a equipo automáticamente al invitar**: el menú y el inicio cambian de
  forma; mejor que sea una decisión visible.

## Consecuencias

- Las páginas `/pro` aceptan a la admin de una org individual; las de `/admin` de
  configuración (marca, página pública, complementos) siguen siendo suyas.
- Una admin de equipo que atiende tiene perfil y agenda (`/pro/profile`,
  `/pro/agenda`) y, si se asigna pacientes, chatea con ellos; el resto de la UI de
  trabajo clínico sigue siendo la del panel de administración.
