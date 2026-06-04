# 0005 — Asignaciones de cuidado versionadas por membership

- **Estado**: aceptada (reemplaza el diseño previo)
- **Fecha**: 2026 (migración 0015)

## Contexto

La relación paciente↔profesional define quién atiende a quién (y, vía el alcance de
acceso, qué pacientes ve cada profesional). El primer diseño (`patient_assignments`,
migración 0006) vinculaba al **user global** y no tenía versión; quedó muerto (sin
uso en código). Al desarrollar la consola del profesional hubo que decidir el modelo
real.

## Opciones consideradas

1. **Mantener `patient_assignments`** (vínculo por `user_id` global, sin versión):
   simple, pero el vínculo correcto es con el **membership** (un user puede estar en
   varias orgs con distinto rol), y sin versión se pierde la historia de quién
   atendió y cuándo (relevante en salud).
2. **Asignación versionada por `membership_id`** (`care_assignments`) con estado
   `active`/`ended`.

## Decisión

**`care_assignments`**, referenciando el `membership` y versionando la vigencia
(`status` + `ended_at` + `assigned_by_membership_id`). Reasignar = cerrar la activa
(`ended`) y abrir otra; **nunca se borra** (el GRANT no da DELETE). Índice único
parcial `… WHERE status='active'` → a lo sumo una asignación activa por (paciente,
profesional). Se dropeó `patient_assignments`.

## Consecuencias

- **A favor**: vínculo correcto con el membership (rol por org); historia clínica de
  cuidado preservada; el alcance de acceso del profesional se deriva de la asignación
  activa; trazabilidad de quién asignó.
- **En contra / costos**: más complejidad que un simple par (lógica de cierre,
  unicidad parcial); el frontend/admin debe modelar "cerrar y reabrir" en vez de
  "editar". Migración destructiva de la tabla previa (era segura por estar sin uso).

Detalle en [`../flows/patients.md`](../flows/patients.md).
