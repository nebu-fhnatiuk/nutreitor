# 0007 — Autorización por capacidades (no por rol crudo)

- **Estado**: aceptada
- **Fecha**: 2026 (sprint de administración del tenant)

## Contexto

Con tres roles (`admin`, `professional`, `patient`) y un set creciente de acciones
(invitar, asignar, leer clínico, escribir plan, auto-reportar…), había que decidir
cómo se autoriza cada endpoint y cómo lo refleja la UI.

## Opciones consideradas

1. **Chequeo por rol crudo** en cada endpoint (`if (role === 'admin')`): directo,
   pero dispersa reglas de negocio en condicionales, es difícil de auditar y la UI
   tiene que replicar la misma lógica de rol para mostrar/ocultar acciones.
2. **Autorización por capacidad**: cada endpoint declara la **capacidad** que
   requiere (`member:invite`, `patient:assign`, `plan:write`, …); un único mapa
   rol→capacidades define el modelo de permisos.

## Decisión

**Capacidades**. `@RequireCapability(...)` + `CapabilityGuard` (corre después del
`JwtAuthGuard`, sobre el rol del contexto). El mapa rol→capacidades vive en
`packages/shared/src/auth/capabilities.ts` y se comparte con el front: `/auth/me`
devuelve `capabilities`, y la UI oculta lo que el rol no tiene.

## Consecuencias

- **A favor**: el permiso requerido es declarativo y local al endpoint; el modelo de
  permisos está en un solo lugar auditable; front y back comparten la misma fuente
  (no se duplica lógica de rol en la UI); agregar un permiso fino no obliga a tocar
  condicionales por todos lados.
- **En contra / costos**: una indirección más (rol → capacidad → endpoint); hay que
  mantener el mapa al día cuando se agregan acciones; sigue habiendo un `RolesGuard`
  para los pocos casos de restricción por rol directo.

Ejemplos de uso en [`../flows/invitations.md`](../flows/invitations.md) y
[`../flows/patients.md`](../flows/patients.md).
