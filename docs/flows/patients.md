# Flujo: pacientes

El paciente es una **entidad clínica** del tenant, separada de la cuenta de acceso
(`users`): puede existir sin cuenta y vincularse a una después (portal). Sobre la
ficha se construyen asignaciones de cuidado (M:N versionada), notas (append-only),
métricas (serie temporal editable) y planes alimentarios (versionados). Todo
tenant-scoped por RLS y gateado por **capacidades** + alcance de acceso.

Esquema en [`../architecture/data-model.md`](../architecture/data-model.md).

## Alcance de acceso (quién ve a qué paciente)

`apps/api/src/modules/patients/patient-access.ts`:

- **admin**: ve todos los pacientes del tenant (RLS por `tenant_id`).
- **professional**: ve sólo pacientes con una `care_assignment` **activa** a su
  `membership` (si no, 404).
- **patient**: resuelve únicamente su propia ficha por `patients.user_id` (portal).

Esto es defensa por encima de RLS: RLS aísla por tenant; el alcance por profesional
acota dentro del tenant.

## Alta y ficha

`POST /patients` (`PatientsController.create` → `PatientsService.create`), capacidad
`patient:create` (admin). `tenant_id` y `region` salen del contexto (ALS), nunca del
request. Los campos clínicos (`reasonForConsult`, `medicalHistory`, `allergies`,
etc.) se aceptan sólo con `patient:read_clinical`. `assignToMembershipId` permite
crear-y-asignar en una sola transacción. Baja **lógica** vía `archived_at`
(`POST /patients/{id}/archive`, capacidad `patient:update`).

## Ficha en cuatro momentos (web)

La ficha del profesional (`components/patients/patient-detail.tsx`, KAN-68) se ordena
por **momento de trabajo**, no por tipo de dato:

```mermaid
flowchart LR
  H["Encabezado<br/>nombre · grupos · alertas clínicas<br/>marcador de últimas cifras"] --> M{"Momento"}
  M --> E["01 Evaluar<br/>Antropometría · Ingesta · Hidratación"]
  M --> P["02 Prescribir<br/>Requerimiento → Plan"]
  M --> S["03 Seguir<br/>Evolución y adherencia · Reportes"]
  M --> C["04 Conversar<br/>Notas · Mensajes · Asistentes"]
  H -.-> F["Ficha clínica<br/>(panel lateral: lectura, edición,<br/>visibilidad, asignaciones)"]
```

- **Marcador** (`athlete-scoreboard.tsx`): última masa corporal, Σ6 con la diferencia
  contra la medición anterior, % graso (Durnin-Womersley, si no Yuhasz), sudoración
  y requerimiento promedio de la semana tipo. Cada cifra lleva a su sección. Sale de
  los listados que ya existen (`anthropometry`, `sweat-tests`, `energy`); si uno
  falla, esa cifra no se muestra.
- **URL:** `?tab=<momento>&sec=<sección>`. Evaluar → Antropometría no lleva
  parámetros. Los links viejos de 12 pestañas (`?tab=plan`, `?tab=hidratacion`…)
  se redirigen con `replace`. `?tab=ficha` abre el panel clínico, y `?tab=resumen`
  va al inicio. La lógica vive en `components/patients/moments.ts`.
- **Mensajes** y **Asistentes** se muestran sólo con permiso (igual que antes). Una
  charla con crisis marca el momento Conversar.

**Paleta de comandos** (KAN-75, `components/command-palette.tsx`): con Ctrl+K o ⌘K
(o el botón "Buscar" del encabezado) el profesional y la admin buscan deportistas,
planteles y acciones: "medir a Juan", "plan de Sofía", "sudor Martina", "plantel
Sub-17". Cada acción va a su momento y sección de la ficha, o a la planilla del
plantel.

- Los datos salen de `GET /patients` y `GET /groups`, que ya aplican el alcance de
  acceso: la paleta no ve más que la lista de pacientes. Se piden al abrirla por
  primera vez.
- La búsqueda es pura (`buildCommands` y `searchCommands` en shared): cada palabra
  tiene que ser el comienzo de una palabra del ítem, sin tildes, ignorando "de" y "a".
  Un verbo ("medir", "plan", "sudor") lleva a la acción; el nombre solo, a la ficha.
- "Mensajes" sólo para quien atiende (no para la admin de un equipo, ADR 0024).

## Asignación de cuidado (M:N versionada)

```mermaid
flowchart TD
  A["POST /patients/{id}/assignments<br/>(membershipId, locationId?)<br/>capacidad patient:assign (admin)"] --> B["valida: paciente no archivado"]
  B --> C["valida: membership activo y no es patient"]
  C --> D["INSERT care_assignment status=active<br/>assigned_by_membership_id = quien asigna"]
  D --> E{"ya hay una activa<br/>para (paciente, membership)?"}
  E -->|sí| F["rechazado por unique parcial activo"]
  E -->|no| G["asignación creada"]

  H["POST /patients/{id}/assignments/{aid}/end<br/>capacidad patient:assign"] --> I["status active → ended, ended_at = now()"]
  I --> J["nunca borra: conserva la historia"]
```

`care_assignments` reemplazó a la vieja `patient_assignments` (ver el ADR
[`../decisions/0005-care-assignments-versionadas.md`](../decisions/0005-care-assignments-versionadas.md)).
Reasignar = cerrar la activa (`ended`) y abrir otra. El índice único parcial
`… WHERE status='active'` garantiza a lo sumo una activa por (paciente, profesional).

## Notas, métricas y planes

Las tres cuelgan del paciente y registran al autor por `membership`. Difieren en
mutabilidad — fijada a nivel de GRANT, no sólo por código:

| Recurso | Endpoints | Capacidad | Mutabilidad |
|---|---|---|---|
| **Notas** (`patient_notes`) | `GET`/`POST /patients/{id}/notes` | `patient:read` / `patient:add_note` | **Append-only** (sólo INSERT+SELECT). Corregir = nueva nota. |
| **Métricas** (`patient_metrics`) | `GET`/`POST` + `PATCH`/`DELETE /patients/{id}/metrics/{mid}` | `metric:read` / `metric:record` | **Editable/borrable** (data entry). Wide para chartables + `extra` JSONB ad-hoc. |
| **Planes** (`meal_plans`) | `GET`/`POST /patients/{id}/plans` + `/plans/archive` | `plan:read` / `plan:write` | **Versionado**: cada save hace supersede del activo y crea `version+1`. Sin DELETE. |

El save de plan calcula `version = max(version)+1`, marca `superseded` al activo e
inserta el nuevo `active`; el índice único parcial `… WHERE status='active'`
garantiza un único plan activo por paciente (un choque concurrente da `409`).

### Estructura del plan (multi-estilo)

El `body` del plan es un documento JSONB flexible por estilo de trabajo: layout
`day` (día-tipo) o `week` (lun-dom), con detalle opcional por item (cantidad,
unidad, alternativas/intercambios, macros) y `targets` del plan. El profesional
elige cuánto detalle carga. Bodies legacy (anteriores al `layout`) se normalizan a
`day` (`normalizeMealPlanBody`, shared) y se migraron en `0021`. Detalle del shape y
el racional en [`../architecture/data-model.md`](../architecture/data-model.md) y el
ADR [`../decisions/0009-estructura-plan-multiestilo.md`](../decisions/0009-estructura-plan-multiestilo.md).

## Visibilidad de la ficha clínica hacia el paciente

Por defecto el paciente **no** ve ningún campo clínico en su portal. La ficha lleva
`clinical_visibility` (jsonb, default `{}`); el profesional/admin habilita campo por
campo desde la ficha (`PATCH /patients/{id}/clinical-visibility`, capacidad
`patient:update_clinical_visibility`, scopeado assigned-only e **auditado**:
`patient.clinical_visibility_updated`). En la UI pro, el panel **"Visible para el
paciente"** (en la ficha, sólo si la sesión puede editar visibilidad) muestra un
**toggle por campo** con su estado actual y un conteo en vivo; cada cambio manda sólo
ese campo (merge JSONB). El stripping es **server-side** en
`getMe` (helper puro `applyClinicalVisibility`): un campo sale al portal sólo si su
flag es `true`; el front nunca decide. Las `patient_notes` quedan **siempre**
internas (no se comparten). Ver el ADR
[`../decisions/0008-visibilidad-campo-ficha-clinica.md`](../decisions/0008-visibilidad-campo-ficha-clinica.md).

## Portal del paciente

El paciente logueado **no** pasa `patientId`: se resuelve "mi ficha" por
`patients.user_id = session.user.id` (`PortalService.resolveMyPatient`). El unique
parcial `patients_tenant_user_unique` garantiza a lo sumo una ficha por (tenant,
user). Endpoints (`apps/api/src/modules/portal/`):

- `GET /portal/me` (capacidad `portal:read`): devuelve perfil + los campos clínicos
  **habilitados** (ver visibilidad arriba; default ninguno), nombres de profesionales
  activos, plan activo y serie de métricas. **No** ve las notas internas del
  profesional.
- `POST /portal/me/metrics` (capacidad `portal:self_report`): auto-reporte de una
  métrica sobre su propia ficha (queda marcada como originada por el paciente).
- `GET /portal/me/adherence?from&to` (`portal:read`) y `PUT /portal/me/adherence/meals`
  / `PUT /portal/me/adherence/checkin` (`portal:self_report`): registro de adherencia
  (ver abajo).

**Adherencia** (Fase 4.3). El paciente marca **cada comida del plan** del día
(cumplí / en parte / no, nota opcional) y una vez por día **cómo se sintió** (hambre,
energía, ánimo de 1 a 5 + nota). Reglas del servidor:

- Sólo sobre **su** ficha y sólo comidas que estén en **su plan activo para esa
  fecha** (si no, 400); se guarda la versión del plan vigente (`plan_id`).
- Ventana: **hoy y los últimos 3 días**, con un día de tolerancia a cada lado por la
  zona horaria del paciente (las fechas son locales del paciente).
- Una fila por (paciente, fecha, comida) y por (paciente, fecha): corregir es un
  **upsert**; no hay `DELETE`.

El profesional asignado la lee en `GET /patients/{id}/adherence?from&to`
(`metric:read`, máx. 62 días; profesional → sólo asignados) y la ve en **Seguir →
Evolución y adherencia**: grilla comida × día de las últimas 2 semanas, el % de los últimos 7 y
14 días (sobre lo **registrado**: cumplí = 1, en parte = ½; sin registros no es 0 %)
y las notas del paciente.

```mermaid
sequenceDiagram
  autonumber
  participant Pa as Paciente (portal)
  participant API
  participant Pr as Profesional (ficha)
  Pa->>API: PUT /portal/me/adherence/meals {date, mealName, status}
  API->>API: mi ficha · comida en mi plan activo para esa fecha · ventana de días
  API-->>Pa: upsert (paciente, fecha, comida)
  Pa->>API: PUT /portal/me/adherence/checkin {date, hambre, energía, ánimo}
  Pr->>API: GET /patients/{id}/adherence?from&to
  API->>API: acceso al paciente (asignado)
  API-->>Pr: registros + sensaciones → grilla y % en Evolución
```

**Antropometría ISAK** ([ADR 0030](../decisions/0030-antropometria-isak.md)) — sección
"Antropometría" de la ficha. `GET/POST /patients/{id}/anthropometry`, `PUT/DELETE
…/{sessionId}` (`metric:read` / `metric:record`, profesional → asignados).

```mermaid
flowchart LR
  A["Sesión: tomas por sitio<br/>(perfil restringido + bloque Kerr opcional)"] --> B{"¿2 tomas difieren<br/>>5% pliegue / >1% resto?"}
  B -->|sí| C["3ª toma obligatoria<br/>(UI + API)"]
  B -->|no| D["Guardar tomas crudas"]
  C --> D
  D --> E["Al leer: valor final = media de 2 / mediana de 3"]
  E --> F["anthropometryResults(sexo, edad a la fecha)"]
  F --> G["Σ6 · Σ8 · % graso (D-W+Siri, Yuhasz, Faulkner)<br/>Somatotipo · Kerr 5 componentes"]
  G --> H{"¿Validado y visible?"}
  H -->|sí| I["Portal: GET /portal/me/anthropometry"]
  H -->|no| J["Portal: nada"]
```

- Lo que no se puede calcular explica por qué (sitios faltantes, sexo no binario,
  menor de 17 para Durnin-Womersley).
- Portal: tarjeta "Tu antropometría" con la última medición y la evolución de Σ6,
  sólo con lo marcado visible. Con Kerr visible, el portal recibe los 5 componentes
  (kg y %) y el índice músculo/óseo, sin el error de estimación, que es técnico. `ANTHROPOMETRY_VALIDATED` (habilitada el 2026-10-20)
  apaga el portal si vuelve a `false`.
- **Somatocarta de Heath-Carter** (KAN-71, `components/patients/somatochart.tsx`):
  ubica cada somatotipo en x = ecto − endo, y = 2·meso − (endo + ecto), con el eje Y
  comprimido por √3 como la carta clásica (los polos 7-1-1, 1-7-1 y 1-1-7 forman un
  triángulo equilátero). En la ficha se dibuja la **estela** de todas las sesiones,
  con la última resaltada. En el grupo (pizarra) se dibuja **un punto por
  deportista**, con su última medición, y el **somatotipo medio** del plantel (la
  media de cada componente). Se filtra por fecha de medición y cada punto lleva a la
  ficha. No hay endpoint nuevo: usa el listado de sesiones y el resumen del grupo.
- **Anillo de Kerr** (KAN-72, `components/patients/kerr-ring.tsx`): los 5 componentes
  como arcos proporcionales al %, con el índice músculo/óseo en el centro y la tabla
  de kg y %. Usa la **última sesión con Kerr** (no todas lo llevan) y la compara con
  la anterior con Kerr: diferencia en kg por componente y variación del índice. Está
  en la ficha (Evaluar → Antropometría) y, si `anthroKerr` es visible, en el portal.

**Requerimiento energético** ([ADR 0032](../decisions/0032-requerimiento-energetico-periodizado.md)) —
sección "Requerimiento" (momento Prescribir) de la ficha. `GET /patients/{id}/energy` (versiones, la
vigente primero), `GET …/energy/context` (peso, talla y masa libre de grasa sugeridos),
`POST …/energy` (versión nueva). Capacidades `plan:read` / `plan:write`.

```mermaid
flowchart LR
  A["Ficha + última antropometría / evolución"] --> B["Peso · talla · MLG sugeridos"]
  B --> C["GER: Mifflin · Harris-Benedict · FAO/OMS · Cunningham"]
  C --> D["Tipo de día: GER × factor + Σ (MET − 1) × kg × h"]
  D --> E["× (1 + ajuste %) → objetivo kcal"]
  E --> F["CHO y PRO en g/kg · grasa = resto"]
  F --> G["Semana tipo → promedio"]
  G --> H["Editor del plan: objetivo diario o un objetivo por día"]
```

- **Tira de la semana** (KAN-73, `components/patients/week-strip.tsx`): los 7 días
  como un gráfico de carga. La altura es la energía del día; el color, el tipo de día
  (partido = segundo color del club, entrenamiento = marca, descanso = neutro), con
  el nombre escrito. Muestra kcal y g de CHO. El mismo componente aparece en el
  requerimiento (semana tipo), en el editor del plan semanal (tocar un día lo
  edita) y en el plan, con hoy marcado. En el portal suma la línea "Hoy: partido ·
  3.416 kcal · 501 g de carbohidratos".

**Recordatorio de 24 h** ([ADR 0033](../decisions/0033-recordatorio-de-24-horas.md)) —
sección "Ingesta" (momento Evaluar) de la ficha. `GET/POST /patients/{id}/recalls`, `PUT/DELETE
…/{recallId}` (`plan:read` / `plan:write`, profesional → asignados).

```mermaid
flowchart LR
  A["1ª pasada: lista rápida"] --> B["2ª pasada: lo que se olvida<br/>(bebidas, aceites, suplementos…)"]
  B --> C["3ª pasada: cantidades y horarios<br/>(items vinculados a la base)"]
  C --> D["Guardar: comidas con forma de plan"]
  D --> E["Al leer: kcal · macros · g/kg · % · kcal por comida"]
  E --> F{"¿Todos los items<br/>con macros?"}
  F -->|sí| G["Comparar con el requerimiento<br/>del tipo de día"]
  F -->|no| H["Total parcial"]
  E --> I["Promedio de los días habituales (≥2)"]
```

**Frecuencia de consumo** ([ADR 0034](../decisions/0034-frecuencia-de-consumo.md)) —
en la misma sección "Ingesta". `GET/POST /patients/{id}/food-frequency`, `PUT/DELETE
…/{surveyId}` (`plan:read` / `plan:write`). 21 items por grupo; frecuencia × porciones →
porciones por día; comparación con las GAPA (referencia, no objetivo) y % de integrales.
Uno nuevo arranca con las respuestas del anterior y muestra el "antes".

**Hidratación** ([ADR 0036](../decisions/0036-hidratacion-y-prueba-de-sudoracion.md)) —
sección "Hidratación" (momento Evaluar) de la ficha y "Medir hidratación" en el grupo.

| Quién | Endpoints | Capacidad |
|---|---|---|
| Equipo | `GET/POST /patients/{id}/sweat-tests`, `PUT/DELETE …/{testId}` | `metric:read` / `metric:record` |
| Equipo | `GET /groups/{id}/sweat-tests` (última de cada uno), `POST /groups/{id}/sweat-tests` (plantel, todo o nada) | `metric:read` / `metric:record` |

```mermaid
flowchart LR
  A["Peso antes · peso después<br/>tomó · orinó · duración"] --> B["Sudor = pérdida + tomado − orina"]
  B --> C["L/h · % de pérdida (aviso > 2 %) · % repuesto"]
  C --> D["Plan: antes 5–7 ml/kg · durante para no pasar el 2 %<br/>después 1,25–1,5 L/kg · sodio si corresponde"]
```

**Grupos y carga por plantel** ([ADR 0031](../decisions/0031-grupos-y-carga-por-plantel.md)) —
planteles, divisiones o turnos. El admin los arma; el profesional ve en cada grupo
solo a sus asignados (un grupo no abre acceso).

| Quién | Endpoints | Capacidad |
|---|---|---|
| Admin | `POST /groups`, `PUT/DELETE /groups/{id}`, `POST /groups/{id}/members`, `DELETE /groups/{id}/members/{patientId}` | `group:manage` |
| Equipo | `GET /groups`, `GET /groups/{id}`, `GET /patients?group={id}` | `patient:read` |
| Equipo | `GET /groups/{id}/anthropometry` (última sesión de cada uno + ΔΣ6) | `metric:read` |
| Equipo | `POST /groups/{id}/anthropometry` (una sesión por deportista, todo o nada) | `metric:record` |

```mermaid
flowchart LR
  A["Planilla del grupo<br/>filas = deportistas, columnas = sitios"] --> B["Pasada 1: toma 1 de todos"]
  B --> C["Pasada 2: toma 2"]
  C --> D{"¿Difieren >5% / >1%?"}
  D -->|sí| E["Pasada 3: solo esos sitios"]
  D -->|no| F["Guardar"]
  E --> F
  F --> G{"¿Todos en el grupo<br/>y visibles?"}
  G -->|no| H["400: no se guarda ninguno"]
  G -->|sí| I["Una sesión por deportista<br/>(misma fecha, una transacción)"]
  I --> J["Resumen del plantel"]
```

- El borrador de la planilla vive en el navegador (`localStorage`, por grupo) hasta
  guardar o descartar.
- Hasta 60 deportistas por carga; los que quedan vacíos no se envían.
- **Modo cancha** ([ADR 0039](../decisions/0039-modo-cancha.md)): desde la planilla
  (antropometría del plantel o individual, e hidratación antes y después) se abre una
  vista de pantalla completa para el celular: un sitio por vez, teclado grande y
  dictado por voz ("tríceps doce coma cinco"). Escribe en el mismo borrador de la
  planilla; se guarda desde la planilla, como siempre.

**Pizarra del plantel** (KAN-70): el grupo abre en una grilla de tarjetas, una por
deportista visible, con un semáforo y ordenada por quién necesita atención.

```mermaid
flowchart LR
  A["GET /groups/{id}/board<br/>metric:read"] --> B["última antropometría<br/>(groupSummary)"]
  A --> C["última prueba de sudoración<br/>(groupSummary)"]
  A --> D["adherencia 7 + 7 días<br/>(adherence_meal_logs)"]
  B & C & D --> E["boardStatus (shared, puro)<br/>zona + avisos"]
  E --> F["orden: fuera → límite → en rango"]
```

| Aviso | Zona | Criterio |
|---|---|---|
| Sin antropometría / sin medir hace N días | en el límite | nunca medido, o más de 30 días |
| Perdió X % entrenando | límite / fuera | más de 2 % / más de 3 % en la última prueba |
| Σ6 subió X mm | en el límite | 2 mm o más contra la medición anterior |
| Adherencia bajó N puntos | en el límite | 15 puntos o más de una semana a la otra |
| Adherencia X % | fuera | menos de 50 % en los últimos 7 días |

- Nada se guarda: la zona se calcula al leer. Los miembros siguen el scoping de
  pacientes (el profesional ve sólo a sus asignados).
- La vista **Tabla** conserva el detalle (somatotipo, Kerr, ecuación de % graso,
  plan de hidratación) y, para la admin, sacar deportistas del grupo.
- Los umbrales están en `BOARD_THRESHOLDS` y se validan en
  [`../validation/pizarra-plantel.md`](../validation/pizarra-plantel.md).
- **Cobertura del grupo** (KAN-34): debajo de los KPIs, con plan vigente, medidos en
  30 días, días desde la última antropometría y adherencia de 30 días (sobre todo lo
  registrado, y cuántos registran). Cada tarjeta dice el plan vigente o "Sin plan".
  Mismo endpoint (`GET /groups/{id}/board`) y mismo scoping.

**Acciones por grupo** ([ADR 0044](../decisions/0044-acciones-por-grupo.md)), todo o
nada en una transacción y repitiendo la operación de a uno:

- **Asignar un profesional** (`POST /groups/{id}/assign`, `patient:assign`, admin):
  `assignInTx` para cada deportista que todavía no lo tiene. Se suma; no le saca a
  nadie el profesional que ya tenía.
- **Aplicar un plan** (`POST /groups/{id}/plan`, `plan:write`): cada deportista visible
  (al profesional, sus asignados) recibe una versión nueva de **su** plan, copiada de
  la plantilla (`MealPlansService.saveInTx`). El vigente pasa al historial, salvo con
  `onlyWithoutPlan`. Después se ajusta de a uno sin tocar a los demás.

**Mensajes** — conversaciones **privadas por par** ([ADR 0024](../decisions/0024-conversaciones-privadas.md);
append-only y polling de [ADR 0022](../decisions/0022-chat-profesional-paciente-polling.md)):

| Conversación | Participan | No la ven |
|---|---|---|
| Paciente ↔ profesional (una por par) | ese paciente y la membresía asignada (con asignación activa): un profesional, o la admin de una org individual ([ADR 0026](../decisions/0026-profesional-independiente-org-de-una-persona.md)) | la admin (salvo que sea ella la asignada), otros profesionales |
| Profesional ↔ administración (una por profesional) | ese profesional y cualquier admin | otros profesionales, pacientes |

| Quién | Endpoints | Capacidad |
|---|---|---|
| Equipo | `GET /conversations` (bandeja), `GET /conversations/unread`, `POST /conversations/patient/{id}` · `/admin` · `/professional/{membershipId}` (abrir), `GET/POST /conversations/{id}/messages`, `POST …/read` | `message:send` |
| Paciente | `GET /portal/me/conversations`, `POST …/professional/{membershipId}`, `GET/POST …/{id}/messages`, `POST …/{id}/read` | `portal:message` |

- Quien no participa recibe **404**. Las conversaciones se crean al abrirlas.
- Polling cada **10 s** con la conversación abierta (`?after=`, dedupe por id); el
  contador del menú, cada 60 s. Escribir marca como leído.
- Si la asignación termina, el paciente conserva la conversación en sólo lectura y
  el profesional deja de verla.
- UI: `/pro/messages` (Administración fija + pacientes), `/admin/messages` (un
  profesional por fila), `/app/mensajes` (un profesional por fila; con uno solo,
  directo), sección **Mensajes** (momento Conversar) en la ficha para quien atiende. En una org
  individual, `/admin/messages` redirige a `/pro/messages` (conservando `?c=`).

**Org individual** ([ADR 0026](../decisions/0026-profesional-independiente-org-de-una-persona.md)):
la admin trabaja desde `/pro`. Al crear un paciente queda asignado a ella, y desde la
ficha lo invita al portal.

**Plantillas de planes** (`/plan-templates`, `plan:read` / `plan:write`): desde el
editor, "Guardar como plantilla" guarda las comidas, el objetivo y las notas (sin
datos del paciente) a nivel consultorio; al crear o revisar un plan, "Empezar desde
una plantilla" las carga en el editor para ajustarlas. Las comparten todos los
profesionales del consultorio; se archivan, no se borran.

**Lista de compras** (`shoppingList` en shared, sin backend): una semana del plan
(día-tipo × 7; semanal, la suma de los días cargados), agrupada por grupo de
alimento. Los items vinculados suman gramos exactos; una **receta se expande en sus
ingredientes** (desglose copiado en el item); los de texto libre se listan aparte con
cuántas veces aparecen; las alternativas no se suman. La ven el paciente
(`/app/compras`, imprimible) y el profesional (botón en Prescribir → Plan).

**En la UI del portal** (`/app`, pensado primero para el celular) lo primero es **lo
que le toca comer hoy**: las comidas del plan activo para la fecha (`mealsForDate`:
día-tipo → siempre las mismas; semanal → las del día de la semana), con un toque por
comida para la adherencia y "¿Cómo te sentiste?" (se puede completar el de ayer), después su
próximo turno, la evolución y sus datos de salud. El plan completo está en
`/app/plan`, listo para **imprimir o guardar como PDF** (al imprimir se oculta la
navegación). El paciente sólo ve un total de calorías/macros cuando **todos** los
items del día los tienen (`macroCoverage`), y nunca el desvío contra el objetivo:
eso es una herramienta del profesional, que ve el total como "parcial" si faltan
datos.

El portal se puede **instalar como app** (PWA white-label: nombre, color e ícono del
consultorio; arranca en `/app`). El portal invita a instalarla (Android: diálogo
nativo; iPhone: "Compartir → Agregar a inicio"). Sin conexión muestra un aviso: no
se guardan datos en el dispositivo ([ADR 0021](../decisions/0021-pwa-white-label-sin-cache.md)).

## Registro de lecturas (quién vio la ficha)

Cada GET del staff que devuelve datos de un deportista deja una fila en
`data_access_log` (KAN-23, ADR [`0042`](../decisions/0042-registro-de-lecturas-de-datos-de-salud.md)).
El portal del deportista no se registra.

```mermaid
sequenceDiagram
  autonumber
  participant W as Web (staff)
  participant C as Controller (@LogsAccess)
  participant I as AccessLogInterceptor
  participant DB as Postgres (RLS)
  W->>C: GET /patients/{id}/metrics
  C->>DB: lectura bajo el tenant
  DB-->>C: filas
  C-->>I: respuesta
  I->>DB: INSERT data_access_log ... ON CONFLICT DO NOTHING (ventana 15 min)
  alt el registro falla
    I-->>W: error (fail-closed)
  else ok
    I-->>W: respuesta
  end
```

La admin lo consulta en la ficha clínica ("Quién vio esta ficha"), que usa
`GET /access-log?patientId=` con la capacidad `audit:read`.

## Import desde un CSV

Alta masiva de deportistas (KAN-42/43/44, ADR [`0043`](../decisions/0043-import-de-deportistas-desde-csv.md)).
Pantalla `/admin/patients/import` (admin, o la profesional independiente), con
`patient:create` + `patient:assign`.

```mermaid
sequenceDiagram
  autonumber
  participant W as Web (admin)
  participant A as API (patients/import)
  participant DB as Postgres (RLS)
  participant K as Worker
  W->>A: POST /patients/import/preview {csv, invite}
  A->>DB: duplicados, grupos por nombre, profesionales por email
  A-->>W: filas con sus errores (no escribe)
  W->>A: POST /patients/import {csv, invite}
  A->>DB: revalida en la misma transacción
  alt alguna fila con error
    A-->>W: 422 (no se escribe nada)
  else todo bien
    A->>DB: patients + grupo + asignación + invitations(queued_at) + audit
    A-->>W: {created, grouped, assigned, invited}
    K->>DB: scan: toma las invitaciones marcadas (SKIP LOCKED), genera el token
    K-->>K: envía de a SEND_PER_SECOND, una vez cada una
  end
```

- **Archivo**: separador `,` o `;`, encabezados en castellano (con alias, sin
  importar tildes ni mayúsculas), hasta 1000 filas. La web relee en Windows-1252 si
  no es UTF-8 (Excel).
- **Columnas**: `nombre` (obligatoria), `email`, `documento`, `fecha_nacimiento`
  (`DD/MM/AAAA` o `AAAA-MM-DD`), `sexo` (F/M/X), `telefono`, `grupo` (uno que exista;
  varios con `|`), `profesional` (email de un miembro activo).
- **Todo o nada**: duplicados en el archivo o contra la organización (email o
  documento, también archivados), grupos o profesionales inexistentes y datos
  inválidos son errores de fila; con uno solo no se importa nada.


## Formularios previos a la consulta

El profesional le pide al deportista que complete la anamnesis o la frecuencia de
consumo desde el portal, y después revisa qué pasa a la ficha (KAN-60, ADR
[`0045`](../decisions/0045-formularios-previos-a-la-consulta.md)). Sólo a deportistas
con cuenta en el portal.

```mermaid
sequenceDiagram
  autonumber
  participant P as Web (profesional)
  participant A as API
  participant DB as Postgres (RLS)
  participant K as Worker
  participant D as Portal (deportista)
  P->>A: POST /patients/:id/intake-requests {kind, message?}
  A->>DB: intake_requests (requested) + audit
  K->>DB: scan: pedidos de las últimas 48 h
  K-->>D: mail con el link /app/formularios/:id
  D->>A: GET /portal/me/intake-requests
  D->>A: POST /portal/me/intake-requests/:id/submit {answers}
  A->>DB: answers + status submitted + audit
  P->>A: POST /patients/:id/intake-requests/:id/review {fields | accept}
  alt anamnesis
    A->>DB: campos elegidos → patients / sport_profile, field_sources
  else frecuencia de consumo aceptada
    A->>DB: food_frequency_surveys (source self_reported)
  end
  A->>DB: status reviewed + applied + audit
```

- **Permisos**: pedir, cancelar y revisar piden `patient:update` sobre un paciente
  visible (el profesional, sólo sus asignados); listar, `patient:read`. El deportista
  ve y contesta los suyos con `portal:read` / `portal:self_report`.
- **Un pedido abierto por tipo**: otro pedido de lo mismo da 409 hasta que se revise o
  se cancele. El deportista envía una sola vez; las respuestas vacías no se guardan.
- **Revisión campo por campo**: la ficha muestra el valor actual al lado del
  respondido, con tilde por campo (por defecto, los que estaban vacíos). Los campos
  aplicados se muestran con el chip "autorreportado" hasta que el profesional los
  cambie a mano. La frecuencia de consumo se guarda entera como encuesta
  autorreportada o se archiva sin guardar.
- **Clínicos**: quien no tiene `patient:read_clinical` no ve las respuestas clínicas
  del pedido ni su origen en la ficha.
- **Automática antes de la primera consulta** (KAN-90): `autoRequestAnamnesis`
  (`intake-auto.ts`) pide la anamnesis sola desde `assignInTx` (toda asignación:
  alta, ficha, grupo, import, consultas de la vidriera) y desde las tres reservas de
  turno.
  - **Se omite si:**
    - ya hubo un turno pasado con ese profesional;
    - ya hay una anamnesis pedida, enviada o revisada;
    - la ficha ya tiene datos clínicos de anamnesis;
    - no hay cómo llegarle (sin cuenta ni email);
    - la organización está en revisión.
  - **Sin cuenta:** deja una invitación al portal en cola y el pedido viaja en ese
    mail (`delivery = 'invitation'`). Al aceptarla, `/accept?next=/app/formularios/:id`
    lleva directo al formulario; `next` sólo acepta esa ruta.
  - **En el panel:** el pedido figura como "automático al asignar" o "automático al
    reservar turno".
- **Web**: panel "Formularios para el deportista" arriba de todo en la ficha clínica, con un contador
  en el botón cuando hay formularios para revisar; en el portal, tarjeta arriba de
  "Hoy" y la página `/app/formularios/:id`.
