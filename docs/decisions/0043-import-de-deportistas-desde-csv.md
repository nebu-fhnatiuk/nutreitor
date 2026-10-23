# 0043 — Import de deportistas desde un CSV, con invitación en lote

- **Estado**: aceptada
- **Fecha**: 2026-10-23
- **Jira**: KAN-42, KAN-43, KAN-44 (Gap 6, KAN-11)

## Contexto

Un club o un gimnasio llega con 100 a 500 deportistas en una planilla. Cargarlos de a
uno no es viable y frena la venta (Fase 2, "Club vendible"). Además hay que sumarlos
a su plantel, asignarles nutricionista e invitarlos al portal sin mandar 500 mails
desde un request ni dos veces el mismo.

## Decisión

- **CSV, no Excel**: un `.csv` lo exporta cualquier planilla. Separador `,` o `;` (el
  Excel en es-AR usa `;`), encabezados en castellano con alias y sin importar tildes;
  si no es UTF-8 la web lo relee en Windows-1252. Hay una plantilla para bajar. Tope
  de 1000 filas por archivo (y el JSON de la API sube a 3 MB para que entre).
- **Vista previa y luego confirmar, todo o nada**: `POST /patients/import/preview`
  valida sin escribir y devuelve los errores por fila; `POST /patients/import` repite
  la misma validación dentro de una sola transacción bajo RLS y, si queda un error,
  responde 422 sin escribir nada. Se descartó importar "lo que se pueda": deja un
  plantel a medias, difícil de completar sin duplicar.
- **Duplicados**: por email o documento (sin puntos) dentro del archivo y contra la
  organización, incluidos los archivados (se restauran, no se duplican).
- **Grupo y profesional en la misma operación** (KAN-44):
  - el grupo tiene que existir (por nombre, sin importar mayúsculas). No se crean
    grupos desde el CSV, para que un error de tipeo no deje grupos basura;
  - el profesional se busca por el email de un miembro activo, y se usa la
    asignación de siempre (`assignInTx`);
  - en una organización de una persona, el deportista queda de quien importa
    (ADR 0026).
- **Sólo datos de identificación**: nombre, email, documento, fecha de nacimiento,
  sexo y teléfono. Lo clínico se carga en la ficha.
- **Invitaciones por el worker** (KAN-43). La API crea las invitaciones de paciente,
  vinculadas a cada ficha y marcadas con `queued_at`, y no manda mails. El worker
  (ADR 0023) suma un scan que:
  - toma las marcadas sin aviso con `FOR UPDATE SKIP LOCKED`, para que dos réplicas
    no tomen la misma;
  - **genera el token al enviar**, porque en la base sólo vive el hash y la API no
    puede dejarle el token en claro. Al worker se le da `UPDATE` sólo de
    `token_hash` y `expires_at`;
  - registra el aviso en `notifications`, cuyo UNIQUE garantiza que cada invitación
    sale una sola vez.

  Los envíos van limitados por segundo (`SEND_PER_SECOND`, default 10) para no pasar
  el rate de SES.
- **Auditoría**: `patient.created` y `member.invited` por cada fila, con
  `source: import`, más un resumen `patients.imported` con los totales.

## Consecuencias

- Mientras el mail está en la cola, el link (con el token) vive en Redis. Es lo mismo
  que con cualquier aviso, y el job se borra al completarse. Si la entrega falla del
  todo, el job queda 7 días para diagnóstico; el token sigue sirviendo sólo para esa
  invitación pendiente.
- Las invitaciones salen con algunos minutos de demora (el intervalo de scan más la
  cola). La pantalla lo avisa.
- Corregir un archivo con errores es responsabilidad de quien importa: la vista
  previa dice qué línea y qué arreglar.
- Pendiente: integración con el software de gestión del gimnasio (KAN-45), y asignar
  profesional o plan a todo un grupo después del alta (KAN-32/33).
