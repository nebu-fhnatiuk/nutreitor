# Rol "Cuerpo técnico": seguir al plantel sin ver la ficha clínica

- **Fecha**: 2026-11-22
- **Estado**: diseño para aprobar

## Para qué

En un club, el DT y el preparador físico quieren saber **cómo vienen los jugadores**:
quién cumple el plan, quién está cansado, quién perdió mucho líquido entrenando. Hoy eso
solo lo ve la nutricionista, en la pizarra del plantel (KAN-70), y se lo cuenta por
WhatsApp. Los sistemas de gestión de deportistas que usan los clubes profesionales
(Smartabase, Kitman, Teamworks) lo resuelven dando a cada rol **lo que necesita para
decidir y nada más**. Es lo que se busca acá.

## Objetivos

- Un rol nuevo, **Cuerpo técnico**, de **sólo lectura**, que el admin del club invita y
  asigna a uno o más **planteles**.
- Una vista propia con el **semáforo del plantel**: adherencia, cómo se sienten, peso,
  sudoración, controles pendientes y si tiene plan.
- **Composición corporal** (Σ6 pliegues y su variación, masa muscular), sólo de los
  deportistas que **dieron su consentimiento**.

## No objetivos

- El cuerpo técnico no carga, edita ni manda mensajes.
- No cubre al médico ni al kinesiólogo: si tienen matrícula, entran como profesionales.
- No hay tablero entre planteles ni comparaciones del club entero (eso puede venir después).
- No se integra con relojes ni carga de entrenamiento (ADR 0053 va por otro lado).

## Antiobjetivos (sería un fracaso aunque funcione)

- Que el cuerpo técnico pueda llegar, por cualquier ruta, a la medicación, las
  patologías, las alergias, las notas clínicas, el plan o los mensajes.
- Que vea la composición corporal de alguien que no dio el consentimiento, incluso
  indirectamente (por ejemplo, el texto "Σ6 subió 4 mm" de un semáforo).
- Que el consentimiento quede sin registro de quién lo dio y cuándo.

## Restricciones

- Son datos de salud (ley 25.326): compartirlos con el club requiere consentimiento del
  titular, revocable.
- Autorización por **capacidades** ([capabilities.ts](../../../packages/shared/src/auth/capabilities.ts));
  RLS por tenant como barrera dura; el scoping fino vive en la capa de servicio
  ([patient-access.ts](../../../apps/api/src/modules/patients/patient-access.ts)).
- Un grupo no abre acceso para profesionales (ADR 0031). Para este rol **sí**: el
  plantel es justamente la unidad de acceso, y la vista es de sólo lectura y recortada.
- Lo de siempre: auditoría append-only, Zod en `packages/shared`, doc viva.

## Enfoques considerados

**A. Rol nuevo con su propia vista (elegido).** Cuarto rol con una sola capacidad de
lectura, asignado a planteles, y un endpoint propio que devuelve la pizarra recortada en
el servidor. Ninguna ruta clínica acepta la capacidad nueva, así que no hay nada que
"tapar". Más piezas: rol, tabla, consentimiento, pantalla, migración.

**B. Profesional en modo sólo lectura.** Una marca en la asignación. Menos piezas, pero
el profesional tiene acceso clínico completo: habría que bloquear cada ruta que lee
ficha, notas o planes, y un olvido filtra datos de salud. Además, se asigna jugador por
jugador. Descartado por el riesgo.

**C. Informe por mail o link sin cuenta.** No se revoca bien, queda en casillas ajenas y
no responde a "cómo vienen hoy". Descartado.

La usuaria eligió **A** el 2026-11-22.

## Diseño

### Rol y capacidad

- `membership_role` suma **`coach`** (en la UI: "Cuerpo técnico"). Migración
  `ALTER TYPE ... ADD VALUE`.
- Capacidad nueva **`team:read`**. El rol `coach` tiene sólo `org:read` y `team:read`.
  El admin también la tiene (tiene todas), así puede ver lo mismo que ve el DT.
- El admin invita con el rol `coach` desde Miembros, igual que hoy a un profesional.
- Al entrar, el rol `coach` va a **`/equipo`** (se suma a las rutas protegidas del
  middleware y al ruteo por rol).

### Planteles del cuerpo técnico

- Tabla **`group_coaches`**: `tenant_id`, `region`, `group_id` → `patient_groups`,
  `membership_id` → `memberships`, `created_at`. Único `(group_id, membership_id)`.
  RLS `tenant_isolation`. Borrar el grupo borra las filas (cascade); revocar la
  membresía corta el acceso porque el scoping exige membresía activa.
- El admin asigna y quita planteles desde la pantalla del grupo (capacidad
  `group:manage`), con auditoría (`group.coach_added` / `group.coach_removed`).
- El `coach` ve **todos los deportistas activos** de sus planteles (no archivados).

### Consentimiento para la composición corporal

- En `patients`: `share_body_with_staff boolean not null default false`,
  `share_body_with_staff_at timestamptz`, `share_body_with_staff_by text`
  (`athlete` | `admin`).
- **El deportista** lo activa o lo revoca desde su portal (Perfil → "Compartir mi
  composición corporal con el cuerpo técnico"), con un texto claro de qué se comparte y
  con quién.
- **El admin** puede registrarlo cuando el jugador firmó el consentimiento en papel del
  club (desde la ficha, con capacidad `patient:update`). Queda `by = admin`.
- Cada cambio va a la auditoría (`patient.staff_sharing_changed`), con quién y el valor.
- Default **no compartido**. Revocar tiene efecto inmediato: todo se calcula al leer.

### Vista `/equipo`

- `GET /team/groups`: los planteles del `coach` (el admin ve todos).
- `GET /team/groups/:id/board`: la pizarra recortada. Reutiliza los cálculos de
  `GroupBoardService`, pero arma un DTO propio, **`TeamBoardDto`**, que sólo tiene:
  - nombre, semáforo (verde / amarillo / rojo) y sus motivos;
  - adherencia de 7 días y su tendencia contra los 7 anteriores;
  - último check-in de energía y ánimo (escala 1–5) y su fecha;
  - peso del último control y su variación;
  - última sudoración: % de peso perdido;
  - si tiene plan vigente (sí/no, sin título ni contenido);
  - próximo turno con la nutricionista, si hay (sólo la fecha);
  - **sólo si consintió**: Σ6 y su variación, y masa muscular (Kerr) y su variación.
- Los **motivos del semáforo** se recalculan sin las banderas de composición corporal
  (`sum6Up`) cuando no hay consentimiento, para que no se filtren por el texto.
- Arriba, la cobertura del plantel: cuántos registran, cuántos tienen plan, cuántos
  midieron en 30 días.
- Sólo lectura. Sin link a la ficha. Celular primero: el DT la mira en la cancha.

```
Fútbol · Primera                     18 de 20 registran · 19 con plan
──────────────────────────────────────────────────────────────────────
● Nicolás Ibarra    Adherencia 91 % ↑   Energía 4/5   78,2 kg  (−0,4)
● Bruno Toledo      Adherencia 48 % ↓   Energía 2/5   81,0 kg  (+1,1)
  Adherencia baja · Perdió 3,1 % entrenando
● Lautaro Ojeda     Adherencia 80 % =   Energía 3/5   74,5 kg  (=)
  Σ6 54 mm (+4)  · Masa muscular 36,2 kg            ← sólo con consentimiento
```

### Qué no puede hacer el `coach` (verificado con tests)

- Cualquier ruta de `/patients/*`, `/groups/*`, planes, notas, mensajes, informes,
  turnos y agentes responde 403 (no tiene la capacidad).
- `/team/groups/:id/board` de un plantel que no le asignaron responde 404.
- La respuesta del tablero no incluye campos de composición corporal de quien no
  consintió (test de forma del DTO, no sólo de la UI).

## Documentación a actualizar

- ADR nuevo: rol de cuerpo técnico y consentimiento para compartir composición corporal.
- `docs/architecture/data-model.md`: `group_coaches`, columnas de `patients`, RLS.
- `docs/flows/patients.md` (o uno nuevo, `team.md`): el flujo del cuerpo técnico.

## Lo que decido yo (corregible)

- Identificador del rol: `coach` (corto y claro en código; en la UI, "Cuerpo técnico").
- Consentimiento en columnas de `patients` y su historia en la auditoría, en vez de una
  tabla de consentimientos aparte: hay un solo consentimiento y la auditoría ya es
  append-only.
- Las lecturas del tablero quedan en el registro de accesos (`group_board`), igual que la pizarra (corregido en la revisión final: la pizarra sí se registra).
- El peso se muestra sin consentimiento (lo acordado: "tendencia de peso" va por
  defecto); Σ6 y masa muscular, no.
- En el club de ejemplo se suma un DT por plantel y consentimiento en la mitad de los
  jugadores, para poder mostrarlo.

## Lo que queda para quien construye

- Nombres de endpoints, componentes y textos finales de la UI.
- Cómo reutilizar el cálculo de `GroupBoardService` sin duplicarlo (extraer la parte
  común o envolverla).
