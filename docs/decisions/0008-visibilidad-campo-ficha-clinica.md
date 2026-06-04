# 0008 — Visibilidad por campo de la ficha clínica hacia el paciente

- **Estado**: aceptada
- **Fecha**: 2026 (vertical clínica — planes + métricas)

## Contexto

El portal del paciente (`getMe`) exponía los 6 campos clínicos de la ficha enteros
(`reasonForConsult`, `medicalHistory`, `allergies`, `currentMedication`,
`diagnosedConditions`, `familyHistory`). Es PHI sensible: qué de eso ve el paciente
es un criterio del profesional, no un default técnico. Había que hacerlo explícito
sin romper lo que el portal ya lee.

## Opciones consideradas

1. **Dejar todo visible** (status quo): simple, pero el profesional no controla qué
   ve el paciente; un antecedente o diagnóstico delicado queda expuesto por defecto.
2. **Política por tenant** (config a nivel organización): un set de flags por campo
   que aplica a todos los pacientes de la org. Un solo switch, pero no distingue
   paciente por paciente (dos pacientes de la misma org no pueden tener visibilidad
   distinta).
3. **Flags por ficha** (`clinical_visibility` jsonb en `patients`): por campo y por
   paciente. Replica el patrón `visibility` jsonb de los perfiles públicos (Sprint 2).
4. **Política estática en código** (sin schema, default fijo): cero configuración,
   pero no curable por el profesional.

## Decisión

**Flags por ficha** (opción 3), con **default conservador**: `clinical_visibility`
es `Record<campo, boolean>` con default `{}` = nada visible. El profesional/admin
habilita campo por campo (`PATCH /patients/:id/clinical-visibility`, capacidad
`patient:update_clinical_visibility`, scopeado assigned-only, auditado). El stripping
es **server-side** en `getMe` vía el helper puro `applyClinicalVisibility` (único
punto de decisión); el front nunca filtra. Las `patient_notes` quedan siempre
internas.

## Consecuencias

- **A favor**: granularidad por paciente (caso real: a un paciente le mostrás sus
  alergias pero no un diagnóstico en proceso); coherente con un patrón ya existente;
  fail-safe (default oculto: un campo nuevo no se filtra hasta habilitarse
  explícito); decisión centralizada en una función testeable.
- **En contra / costos**: superficie de gestión por paciente (el profesional cura
  cada ficha); el default conservador **cambia el comportamiento actual** (el
  paciente pasa a ver menos hasta que se habilite) — se asumió a propósito.
  "No romper el portal" se interpretó como "la UI tolera `null`", no como "el set
  visible queda igual".
- **Migración**: `0020` agrega la columna con default `{}` (aditiva, no toca RLS;
  `patients` ya está bajo `tenant_isolation` y el rol app ya tiene UPDATE).

Detalle del flujo en [`../flows/patients.md`](../flows/patients.md).
