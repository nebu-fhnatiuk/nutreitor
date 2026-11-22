# Rol "Cuerpo técnico" — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un rol `coach` de sólo lectura que ve, por plantel asignado, el semáforo de sus jugadores y la composición corporal sólo de quien consintió.

**Architecture:** rol y capacidad nuevos en `packages/shared`; tabla `group_coaches` y columnas de consentimiento en `patients`; el scoping de `visibleMembers` acepta al `coach` en sus planteles, así los resúmenes existentes (antropometría, sudoración, adherencia) sirven sin duplicarse; un módulo `team` arma un DTO propio y recortado; pantalla `/equipo` en la web.

**Tech Stack:** NestJS 11, Drizzle + Postgres 17 (RLS), Zod en `packages/shared`, Next.js 15, Vitest.

**Spec:** [docs/superpowers/specs/2026-11-22-cuerpo-tecnico-design.md](../specs/2026-11-22-cuerpo-tecnico-design.md)

## Global Constraints

- Rol `coach`; en la UI, "Cuerpo técnico". Capacidad `team:read`. `coach` tiene exactamente `["org:read", "team:read"]`.
- Home del `coach`: `/equipo`.
- Consentimiento: `patients.share_body_with_staff boolean not null default false`, `share_body_with_staff_at timestamptz`, `share_body_with_staff_by text` en (`athlete`, `admin`).
- Sin consentimiento, el tablero no lleva Σ6, su variación, masa muscular ni la bandera `sum6Up`. El peso sí.
- Auditoría: `group.coach_added`, `group.coach_removed`, `patient.staff_sharing_changed`. Las lecturas del tablero no se auditan.
- Plantel ajeno → 404. Rutas clínicas para `coach` → 403 (por capacidad).
- Prosa en español de Argentina; identificadores en inglés. Commits con clave Jira (`KAN-109`).
- Local: tests con Postgres en `127.0.0.1:55432` (ver memoria `local-testing`); pnpm vía `npx -y pnpm@9.12.3`.

## Review Focus

1. **Coach con membresía revocada**: debe dejar de ver el tablero en el acto (404), aunque siga en `group_coaches`. Test en Task 3.
2. **Deportista archivado o sacado del plantel**: no aparece en el tablero del coach. Test en Task 4.
3. **Consentimiento revocado**: la próxima lectura ya no trae Σ6 ni masa muscular. Test en Task 5.
4. **Admin abre `/equipo`**: ve todos los planteles y todos los jugadores (tiene `team:read`), con el mismo recorte por consentimiento. Test en Task 4.
5. **Coach de dos planteles con un jugador en ambos**: el jugador aparece en cada plantel sin duplicarse dentro de uno. Test en Task 4.

---

### Task 1: Base de datos (rol, `group_coaches`, consentimiento)

**Files:**
- Create: `packages/db/migrations/0056_coach_role.sql`
- Create: `packages/db/src/schema/group-coaches.ts`
- Modify: `packages/db/src/schema/memberships.ts` (enum), `packages/db/src/schema/patients.ts` (3 columnas), `packages/db/src/schema/index.ts` (export)
- Test: `apps/api/test/team.e2e.spec.ts` (bloque "group_coaches RLS")

**Interfaces:**
- Produces: tabla Drizzle `groupCoaches { tenantId, region, groupId, membershipId, createdAt }`, PK `(groupId, membershipId)`; `patients.shareBodyWithStaff`, `shareBodyWithStaffAt`, `shareBodyWithStaffBy`.

- [ ] **Step 1:** Test que falla: con dos tenants, una fila de `group_coaches` insertada en A no se ve con el contexto de B (`select` vacío) y el insert con `tenant_id` de A desde el contexto de B falla por la policy.
- [ ] **Step 2:** Correr `npx -y pnpm@9.12.3 --filter @nutreitor/api test -- team.e2e` → FAIL (la tabla no existe).
- [ ] **Step 3:** Migración, con el mismo formato que `0043_patient_groups.sql`:
  - `ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'coach';`
  - `group_coaches` con FK a `organizations` (cascade), `patient_groups` (cascade) y `memberships` (cascade), índice por `membership_id`, `GRANT SELECT, INSERT, DELETE ... TO nutreitor_app`, RLS `ENABLE` + `FORCE` + policy `tenant_isolation`;
  - las tres columnas de `patients`, con `CHECK (share_body_with_staff_by IN ('athlete','admin'))`.
  - Schema Drizzle equivalente.
- [ ] **Step 4:** Test → PASS. `--filter @nutreitor/db typecheck` limpio.
- [ ] **Step 5:** Commit `KAN-109 feat(db): rol coach, group_coaches y consentimiento`.

### Task 2: Rol, capacidad y DTOs compartidos

**Files:**
- Modify: `packages/shared/src/dtos/auth.dto.ts` (`membershipRoles`, `roleHome.coach = "/equipo"`), `packages/shared/src/auth/capabilities.ts`
- Create: `packages/shared/src/dtos/team.dto.ts`, `packages/shared/src/team-board.ts`; export en el index
- Modify: `packages/shared/src/dtos/group.dto.ts` (`GroupAnthropometryRowDto.bodyMassDelta: number | null`)
- Test: `apps/api/test/team-board.spec.ts`, `apps/api/test/capability.guard.spec.ts`

**Interfaces:**
- Produces:
  - `staffSharingSchema = z.object({ shareBody: z.boolean() })`, `StaffSharingDto`.
  - `TeamGroupDto { id; name; members: number }`.
  - `TeamBoardRowDto { patientId; fullName; status: BoardStatus; adherence7; adherencePrev7; checkin: { date; energy; mood } | null; bodyMass; bodyMassDelta; lossPct; hasPlan: boolean; nextAppointmentAt: string | null; body: { sum6; sum6Delta; muscleKg; muscleKgDelta } | null }`.
  - `TeamBoardDto { today; group: { id; name }; rows: TeamBoardRowDto[]; coverage: { members; logging30; withPlan; measured30 } }`.
  - `teamBoardRow(input: TeamRowInput, today: string): TeamBoardRowDto`, puro. `TeamRowInput` = los campos del row más `consent: boolean`, `sum6`, `sum6Delta`, `muscleKg`, `muscleKgDelta`, `lastMeasuredOn`. Sin consentimiento, `body = null` y `boardStatus` se llama con `sum6Delta: null`.

- [ ] **Step 1:** Tests que fallan:
  - `teamBoardRow` con `consent: false` y `sum6Delta: 5` → `body === null` y ninguna bandera `kind === "sum6Up"`;
  - con `consent: true` → `body.sum6Delta === 5` y la bandera presente;
  - `roleCapabilities.coach` igual a `["org:read", "team:read"]`; `hasCapability("coach", "patient:read") === false`; `roleHome.coach === "/equipo"`.
- [ ] **Step 2:** Correr `... test -- team-board capability.guard` → FAIL.
- [ ] **Step 3:** Implementar. El compilador marca cada `Record<MembershipRole, …>` del repo: completarlos con `coach` / "Cuerpo técnico" (`workspace-shell.tsx`, `members-admin.tsx`, `accept-invite.tsx`; `access-log-panel.tsx` es `Partial` y suma la etiqueta igual).
- [ ] **Step 4:** Tests → PASS; `p -w typecheck` limpio.
- [ ] **Step 5:** Commit `KAN-109 feat(shared): rol coach, team:read y tablero recortado`.

### Task 3: Planteles del coach (admin) y scoping

**Files:**
- Modify: `apps/api/src/modules/patients/patient-access.ts` (`PatientAccess.role: MembershipRole`), `apps/api/src/modules/patients/groups.service.ts` (`visibleMembers` y métodos de coaches), `apps/api/src/modules/patients/groups.controller.ts`
- Test: `apps/api/test/team.e2e.spec.ts`

**Interfaces:**
- Produces:
  - `GET /groups/:id/coaches` → `{ membershipId; fullName; email }[]` (`group:manage`).
  - `POST /groups/:id/coaches` body `{ membershipId }` (`group:manage`); 400 si la membresía no es `coach` activa del tenant.
  - `DELETE /groups/:id/coaches/:membershipId` (`group:manage`).
  - `visibleMembers(tx, groupId, access)`: si `access.role === "coach"`, devuelve todos los miembros activos **sólo si** existe `group_coaches(groupId, access.membershipId)` con la membresía activa; si no, `[]`.
  - `coachHasGroup(tx, groupId, access): Promise<boolean>`, exportada.

- [ ] **Step 1:** Tests que fallan:
  - admin agrega un coach → 201 y audit `group.coach_added`; quitar → audit `group.coach_removed`;
  - agregar una membresía `professional` → 400;
  - un profesional pide `POST /groups/:id/coaches` → 403;
  - **Review Focus 1:** coach agregado y luego con membresía revocada → `coachHasGroup` false.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar. `resolvePatientAccess` devuelve también `role` (de `getAuth().user.role`) y busca la membresía con `revokedAt IS NULL`, como hoy.
- [ ] **Step 4:** Tests → PASS, incluidos `groups.e2e` y `patients-authz.e2e` sin cambios.
- [ ] **Step 5:** Commit `KAN-109 feat(api): planteles del cuerpo técnico`.

### Task 4: Módulo `team` (tablero recortado)

**Files:**
- Create: `apps/api/src/modules/team/team.module.ts`, `team.controller.ts`, `team.service.ts`; registrar en `app.module.ts`
- Modify: `apps/api/src/modules/patients/anthropometry.service.ts` (`groupSummary` suma `bodyMassDelta`), `group-board.service.ts` (extraer `adherence(groupId, today)` a un método público reutilizable `adherenceSummary`)
- Test: `apps/api/test/team.e2e.spec.ts`

**Interfaces:**
- Consumes: `visibleMembers`/`coachHasGroup` (Task 3); `teamBoardRow` (Task 2); `AnthropometryService.groupSummary`, `HydrationService.groupSummary`, `GroupBoardService.adherenceSummary`.
- Produces:
  - `GET /team/groups` → `TeamGroupDto[]` (`team:read`): coach, sus planteles; admin, todos.
  - `GET /team/groups/:id/board` → `TeamBoardDto` (`team:read`): 404 si el coach no tiene el plantel.
  - Check-in: el último `adherence_checkins` de cada jugador en los últimos 14 días. Turno: el próximo `appointments` con `status = 'booked'` y `startsAt > now()`. Masa muscular: `results.kerr.ok ? results.kerr.value.muscleKg : null`, con delta contra la sesión anterior.

- [ ] **Step 1:** Tests que fallan:
  - coach ve su plantel con N filas;
  - **Review Focus 2:** un jugador archivado o sacado del grupo no figura;
  - plantel no asignado → 404;
  - el JSON de un jugador sin consentimiento no tiene la clave `sum6` en ningún nivel (`JSON.stringify(row)` sin `"sum6"` ni `"muscleKg"`), y `status.flags` no tiene `sum6Up`;
  - **Review Focus 4:** admin → ve todos los planteles en `/team/groups`;
  - **Review Focus 5:** jugador en dos planteles del mismo coach → aparece una vez en cada tablero;
  - coach contra `GET /patients`, `GET /groups/:id/board`, `GET /patients/:id/plans`, `GET /conversations`, `GET /patients/:id/notes` → 403.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar. `TeamService.board` valida el acceso primero (`coachHasGroup` o admin), después junta los resúmenes y mapea con `teamBoardRow`. No devuelve título de plan.
- [ ] **Step 4:** Tests → PASS; `group-board` y `anthropometry.e2e` siguen verdes.
- [ ] **Step 5:** Commit `KAN-109 feat(api): tablero del cuerpo técnico`.

### Task 5: Consentimiento (portal y ficha)

**Files:**
- Modify: `apps/api/src/modules/portal/portal.controller.ts` + `portal.service.ts` (`PortalMeDto.shareBodyWithStaff: boolean`), `apps/api/src/modules/patients/patients.controller.ts` + `patients.service.ts` (y `PatientDto` con los tres campos)
- Test: `apps/api/test/team.e2e.spec.ts`, `apps/api/test/portal.e2e.spec.ts`

**Interfaces:**
- Produces:
  - `PUT /portal/me/staff-sharing` body `StaffSharingDto` (`portal:self_report`) → guarda con `by = "athlete"`.
  - `PATCH /patients/:id/staff-sharing` body `StaffSharingDto` (`patient:update`, scoping de siempre) → guarda con `by = "admin"`.
  - Ambos: `at = now()` y audit `patient.staff_sharing_changed` con `{ shareBody, by }`.

- [ ] **Step 1:** Tests que fallan:
  - el deportista activa → el tablero del coach trae `body`;
  - **Review Focus 3:** revoca → la siguiente lectura trae `body: null`;
  - admin registra → `shareBodyWithStaffBy === "admin"`;
  - hay dos entradas de auditoría;
  - un coach contra `PATCH /patients/:id/staff-sharing` → 403.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5:** Commit `KAN-109 feat(api): consentimiento para compartir la composición corporal`.

### Task 6: Web

**Files:**
- Modify: `apps/web/src/middleware.ts` (`PROTECTED` suma `"/equipo"`), `apps/web/src/components/workspace-shell.tsx` (`NAV.coach = [{ href: "/equipo", label: "Equipo" }]`)
- Create: `apps/web/src/app/s/[slug]/equipo/page.tsx`, `apps/web/src/components/team/team-board.tsx`
- Modify: la página del grupo en admin (`apps/web/src/app/s/[slug]/admin/groups/[id]`): sección "Cuerpo técnico" para agregar o quitar; `members-admin.tsx`: opción de invitar como "Cuerpo técnico"; ficha del paciente: interruptor "Comparte su composición corporal con el cuerpo técnico (consentimiento firmado)"; `portal-adherence.tsx`, junto a las preferencias: interruptor con el texto de abajo.
- Texto del portal (copia fija): **"Compartir mi composición corporal con el cuerpo técnico"** — "Si lo activás, el cuerpo técnico de tus planteles ve tus pliegues (Σ6) y tu masa muscular. Nunca ve tu ficha, tu plan ni tus mensajes. Lo podés desactivar cuando quieras."

- [ ] **Step 1:** Implementar la vista `/equipo` según el boceto del spec. Con un plantel, entra directo; con varios, elige arriba. Mobile primero, sin link a la ficha.
- [ ] **Step 2:** `p --filter @nutreitor/web typecheck lint` limpio.
- [ ] **Step 3:** Recorrido con Playwright contra el club de ejemplo (Task 7):
  - el DT entra y cae en `/equipo`;
  - ve semáforos y no ve Σ6 de quien no consintió;
  - a 390 px no hay scroll horizontal;
  - el deportista activa el consentimiento y el DT ya ve su Σ6.
  Capturas en `.playwright-mcp/`.
- [ ] **Step 4:** Commit `KAN-109 feat(web): vista del cuerpo técnico y consentimiento`.

### Task 7: Club de ejemplo y documentación

**Files:**
- Modify: `apps/api/src/scripts/club-data.ts` (`STAFF` suma un DT por plantel, rol `coach`: fútbol "Diego Arce", hockey "Laura Méndez", básquet "Pablo Sosa"), `apps/api/src/scripts/seed-club.ts` (membresía `coach`, `group_coaches` vía `svc.groups.addCoach`, consentimiento en la mitad de cada plantel por `PUT /portal/me/staff-sharing` como el deportista, y los DT en el listado final)
- Create: `docs/decisions/0054-rol-cuerpo-tecnico.md`, `docs/flows/team.md`
- Modify: `docs/architecture/data-model.md` (`group_coaches`, columnas de `patients`, RLS), `README.md` (cuenta de DT en la sección del club de ejemplo)

- [ ] **Step 1:** Rearmar la base de prueba y correr `seed:club` (comando en el PR #131). Revisar en la base: 3 filas en `group_coaches` y cerca de la mitad de los jugadores con `share_body_with_staff`.
- [ ] **Step 2:** Escribir el ADR (contexto, opciones A/B/C, decisión, consecuencias), el flujo (Mermaid: invitar → asignar plantel → consentimiento → tablero) y el modelo de datos.
- [ ] **Step 3:** `p -w lint typecheck test` verde.
- [ ] **Step 4:** Commit `KAN-109 docs: rol cuerpo técnico (ADR 0054, flujo y modelo de datos)`.
