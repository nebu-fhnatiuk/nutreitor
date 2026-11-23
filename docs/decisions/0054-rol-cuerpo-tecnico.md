# 0054 — Rol de cuerpo técnico y consentimiento para compartir la composición corporal

- **Estado**: aceptada
- **Fecha**: 2026-11-22
- **Jira**: KAN-109

## Contexto

En un club, el DT y el preparador físico quieren saber cómo vienen los jugadores:
quién cumple el plan, quién está cansado, quién perdió mucho líquido entrenando. Hasta
ahora lo veía sólo la nutricionista en la pizarra del plantel (KAN-70) y lo contaba por
WhatsApp. Los sistemas de gestión de deportistas que usan los clubes profesionales le
dan a cada rol lo que necesita para decidir y nada más: el cuerpo técnico ve un
semáforo, el preparador físico suma la composición corporal y el área médica, todo.

La ficha tiene datos de salud (pliegues, % graso, medicación, patologías). Mostrárselos
al club es cederlos a un tercero: la ley 25.326 pide el consentimiento del titular, y
tiene que poder revocarlo.

## Opciones consideradas

1. **Rol nuevo con su propia vista.** Un cuarto rol, `coach`, con una sola capacidad
   (`team:read`), asignado a planteles. Un endpoint propio devuelve la pizarra recortada
   en el servidor.
2. **Profesional en modo sólo lectura.** Una marca en la asignación. Menos piezas, pero
   el profesional tiene acceso clínico completo: habría que bloquear cada ruta que lee la
   ficha, las notas o los planes, y un olvido filtra datos de salud. Además se asigna
   jugador por jugador.
3. **Informe por mail o link sin cuenta.** No se revoca bien, queda en casillas ajenas y
   no responde a "cómo vienen hoy".

## Decisión

**Opción 1.**

- `membership_role` suma `coach` ("Cuerpo técnico" en la UI). Sus capacidades son
  exactamente `org:read` y `team:read`. Ninguna ruta clínica acepta `team:read`, así que
  no hay nada que "tapar": la barrera es la misma autorización por capacidades de
  siempre.
- **El plantel es la unidad de acceso** para el coach (`group_coaches`, lo arma el
  admin). Es una excepción acotada a "un grupo no abre acceso" (ADR 0031): vale sólo
  para el tablero recortado, exige membresía activa y no da acceso a la ficha. Un
  plantel ajeno responde 404.
- **El coach no atiende**: no se lo puede asignar como profesional de un deportista
  (si no, el deportista lo vería como "su profesional" en el portal). Si a un miembro
  se le cambia el rol a `coach`, o vuelve invitado como `coach`, se cierran sus
  asignaciones vigentes y su perfil sale de la vidriera. No tiene perfil público.
- **Tablero** (`GET /team/groups/:id/board`): semáforo y motivos, adherencia de 7 días y
  tendencia, último check-in de energía y ánimo, peso y su variación, % de pérdida en la
  sudoración, si tiene plan (sí/no) y la fecha del próximo turno. Reutiliza los cálculos
  de la pizarra; el recorte es una función pura en `packages/shared` (`teamBoardRow`).
- **Composición corporal con consentimiento**: Σ6, su variación y masa muscular (Kerr)
  aparecen sólo si `patients.share_body_with_staff`. El deportista lo activa o revoca en
  el portal; el admin (o quien lo atiende) lo registra en la ficha si firmó el papel del
  club. La tarjeta del portal aparece si algún plantel tiene cuerpo técnico o si el
  consentimiento está activo (siempre se puede revocar), y le cuenta al deportista qué
  ve el cuerpo técnico sin consentimiento. Default apagado, cada cambio auditado (`patient.staff_sharing_changed`), y rige en
  la próxima lectura porque todo se calcula al leer. Sin consentimiento, el semáforo se
  calcula sin la variación de Σ6, para que no se filtre por el texto ("Σ6 subió 4 mm").
- **El peso se muestra sin consentimiento**: es lo que el cuerpo técnico ya pesa en el
  vestuario y el dato que acordó la nutricionista para el semáforo por defecto.
- Cada lectura del tablero queda en el registro de accesos (`data_access_log`,
  recurso `group_board`, ADR 0042), igual que la pizarra: es un tercero no clínico
  leyendo datos de salud. Se auditan además las
  asignaciones de plantel (`group.coach_added` / `group.coach_removed`) y el
  consentimiento.

## Consecuencias

- **A favor**: el cuerpo técnico tiene su vista sin depender de la nutricionista, y el
  dato sensible sale sólo con consentimiento explícito y revocable.
- **A favor**: agregar un dato al tablero es una decisión en un solo lugar
  (`teamBoardRow` + `TeamBoardDto`), con tests que verifican la forma del JSON.
- **En contra**: un rol más en cada mapa por rol de la UI (el compilador los marca).
- **Pendiente**: médicos y kinesiólogos entran como profesionales; si más adelante el
  club quiere una vista entre planteles o comparaciones, va en otra decisión.
