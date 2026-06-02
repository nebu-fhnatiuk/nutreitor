# `agents/` — slot reservado (NO implementar todavía)

Este directorio es un **slot desacoplado** para los agentes de IA del producto
(CHEF / NUTRI / PSICO). Está vacío a propósito: existe para encenderlos más
adelante **sin refactor** del backend.

## Decisión de arquitectura (ya tomada)

- Los agentes **no** viven en este proceso NestJS. Cuando lleguen, correrán en un
  **servicio Python separado**.
- Ese servicio consume **el mismo Postgres** y **las mismas RLS policies** que la
  API. Es decir: se conecta con un rol equivalente a `nutreitor_app` (sujeto a
  RLS) e inyecta `app.current_tenant_id` por transacción, exactamente igual que
  `TenantDbService`. El aislamiento multi-tenant es transversal y no se
  reimplementa.

## Por qué dejar el slot ahora

- Marca el límite del bounded context y evita que lógica de agentes se filtre a
  los módulos de negocio.
- Documenta el contrato de datos/aislamiento que el servicio Python deberá honrar.

Cuando se active, este README se reemplaza por el cliente/gateway que la API use
para hablar con el servicio de agentes (cola, gRPC o HTTP interno, a definir).
