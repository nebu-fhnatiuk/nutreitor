# 0045 — Formularios previos a la consulta desde el portal

- **Estado**: aceptada
- **Fecha**: 2026-10-26
- **Jira**: KAN-60; actualizado por KAN-90 (2026-10-26)

## Contexto

La anamnesis y la frecuencia de consumo (ADR 0034) se cargaban en la consulta, con el
deportista enfrente. Buena parte de eso (deporte, días de entrenamiento, suplementos,
antecedentes) el deportista lo puede contestar antes, desde su casa, y la consulta
queda para lo que necesita criterio profesional. El riesgo es que lo que escribe el
deportista se mezcle con lo validado por el profesional sin que se note.

## Decisión

- **El profesional pide, el deportista contesta, el profesional revisa.** Un pedido
  (`intake_requests`) pasa por `requested → submitted → reviewed`, o `cancelled`. Hay
  un solo pedido abierto por deportista y tipo (índice único parcial), así no se
  juntan dos anamnesis sin revisar.
- **Sólo a deportistas con cuenta en el portal.** Sin cuenta, el pedido se rechaza
  con un 409 que sugiere invitarlo primero. Se descartó el link público con token: un
  formulario clínico sin login abre otra superficie de ataque y otro flujo de
  consentimiento.
- **Anamnesis = campos de la ficha + perfil deportivo.** Las preguntas mapean 1 a 1
  con columnas de `patients` (motivo, objetivo, antecedentes, alergias, medicación,
  actividad, preferencias) y con un bloque nuevo `patients.sport_profile` (deporte,
  posición, días y horas de entrenamiento, nivel, lesiones, suplementos, sueño,
  comidas por día). Los textos están en `ANAMNESIS_FIELDS` (shared); ver
  [`../validation/anamnesis.md`](../validation/anamnesis.md).
- **Pasa a la ficha campo por campo.** La revisión muestra el valor actual al lado
  del respondido y el profesional marca qué campos pasan; por defecto, los que
  estaban vacíos. Nada se pisa sin que lo elija. Cada campo aplicado queda en
  `patients.field_sources` con su origen (`self_reported`, pedido, quién lo revisó y
  cuándo), y la ficha lo muestra con un chip "autorreportado". Si el profesional
  después edita ese campo a mano, el chip se va.
- **La frecuencia de consumo se acepta entera o se archiva.** Aceptada, se guarda
  como una encuesta más, con `source = 'self_reported'`; no se mezcla con una
  encuesta existente.
- **Respuestas crudas guardadas.** `intake_requests.answers` conserva lo que mandó el
  deportista y `applied` lo que pasó a la ficha, para poder auditar la diferencia.
  Las respuestas clínicas se ocultan a quien no tiene `patient:read_clinical`.
- **Aviso por mail** (worker): al deportista, con el link al formulario. Sin datos.
- **Anamnesis automática antes de la primera consulta** (KAN-90).
  - **Cuándo se pide:** al asignarle un profesional al deportista y al reservar un
    turno (lo reserve el profesional, el deportista o un visitante de la vidriera).
    Se pide sola, en nombre de ese profesional, y queda marcada con su origen
    (`trigger`).
  - **Cuándo no:**
    - el deportista ya tuvo un turno pasado con ese profesional;
    - ya tiene una anamnesis pedida, enviada o revisada;
    - la ficha ya tiene datos clínicos de anamnesis.
  - **Sin cuenta:** se mantiene la regla de "sólo con cuenta". El pedido viaja dentro
    de una invitación al portal en cola (`delivery = 'invitation'`), la misma que
    usa el import. El mail dice "completá tu ficha antes de la primera consulta" y
    el link crea la cuenta y lleva directo al formulario. Si ya tenía una invitación
    pendiente, se reutiliza. Sin cuenta ni email, o con la organización en
    revisión, no se pide.
  - **Robustez:** corre en un savepoint; si falla, la asignación o la reserva siguen
    igual.
  - **Import sin "invitar":** el admin eligió no invitar, y se respeta. No se pide.

## Consecuencias

- La ficha distingue dato autorreportado de dato validado, sin una tabla de
  versiones por campo: `field_sources` guarda sólo el último origen de cada campo.
  La historia completa está en `intake_requests` y en el audit log.
- El deportista no puede corregir un formulario después de enviarlo; si se equivocó,
  el profesional lo archiva y pide otro.
- El cuestionario es fijo (no hay un editor de formularios). Sumar o cambiar una
  pregunta es un cambio de código en `ANAMNESIS_FIELDS` y, si es un campo nuevo, una
  columna o una clave de `sport_profile`.
