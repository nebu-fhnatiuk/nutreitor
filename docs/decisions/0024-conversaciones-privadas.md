# 0024 — Conversaciones privadas por par

- **Estado**: aceptada (reemplaza el alcance de conversación de ADR 0022)
- **Fecha**: 2026-10-18

## Contexto

ADR 0022 armó una conversación por paciente con **todo su equipo**: la admin y
todos los profesionales asignados leían y escribían. Requisito de la usuaria: las
conversaciones tienen que ser visibles **sólo entre paciente y profesional**, y
aparte **entre profesional y admin**.

## Decisión

- Tabla `conversations` con dos tipos:
  - **`patient_professional`**: una por (paciente, profesional). Participan sólo ese
    paciente y ese profesional, mientras tenga la asignación activa (mismo criterio
    que la ficha). Con dos profesionales asignados hay dos conversaciones y ninguno ve
    la del otro. **La admin no participa** (ni lee, ni escribe, ni recibe avisos).
  - **`professional_admin`**: una por profesional con "la administración": la ve
    cualquier admin; los otros profesionales no.
- Unicidad por índices parciales; se crean al abrirlas (`get-or-create`).
- `messages` (append-only por GRANT) y `conversation_reads` (no leídos por
  participante) cuelgan de la conversación. Polling igual que en ADR 0022.
- Quien no participa recibe **404** (no se revela que existe).
- Si la asignación termina: el paciente conserva la conversación en sólo lectura; el
  profesional deja de verla (como la ficha).
- Migración 0035: lo de 0033 pasa a la conversación (paciente, profesional) que
  corresponde; lo que una admin había escrito en el chat de un paciente no se migra.
- El worker (ADR 0023) avisa sólo a participantes.

## Alternativas descartadas

- **Una conversación compartida** entre el paciente y todos sus profesionales: más
  simple, pero un profesional leería lo que el paciente habló con otro.
- **Una conversación por par profesional–admin**: sólo suma si hay admins con roles
  distintos; hoy "la administración" es una sola función.

## Consecuencias

- La bandeja depende del rol: el profesional ve la administración (fija) y sus
  pacientes; la admin, a cada profesional activo; el paciente, a cada profesional
  asignado.
- La ficha del paciente sólo muestra "Mensajes" al profesional.
