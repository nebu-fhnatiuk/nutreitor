# 0017 — Rate-limiting de endpoints públicos y login con Redis

- **Estado**: aceptada
- **Fecha**: 2026-10-16

## Contexto

Varios endpoints se usan **sin sesión** (o antes de tenerla) y no tenían ningún
límite:

- `POST /auth/login`: se podía probar contraseñas por fuerza bruta contra una cuenta,
  o rociar contraseñas comunes contra muchas.
- `POST /public/orgs/:slug/professionals/:profileSlug/appointments`: la reserva
  pública crea **siempre** un paciente lead nuevo (a propósito, ver
  `docs/flows/scheduling.md`), así que un script podía llenar la base de fichas
  basura y tomar todos los horarios de un profesional.
- `GET .../slots`, `GET /invitations/lookup`, `POST /invitations/accept`.

Además, la API **no veía la IP del cliente**: todo entra por el proxy de Next
(`app/api/[...path]`), que no la reenviaba. Cualquier límite por IP habría metido a
todos los visitantes en el mismo balde.

## Decisión

### Contadores en Redis, ventana fija

Cada regla cuenta hits por sujeto en una ventana fija: `INCR` + `EXPIRE … NX` en
una transacción (`MULTI`). La clave es `rl:{regla}:{hash del sujeto}:{n° de ventana}`;
el sujeto (IP o email) se **hashea** porque es dato personal y no tiene por qué
quedar legible en Redis.

| | En memoria (`@nestjs/throttler`) | Postgres | **Redis (elegido)** |
|---|---|---|---|
| Varias instancias de la API | No: cada una cuenta por su lado | Sí | **Sí** |
| Sobrevive a un deploy | No | Sí | Sí (ventanas cortas, da igual) |
| Costo por request limitado | Nulo | Una escritura en la base transaccional | **Un round-trip a memoria** |
| Infra nueva | No | No | **Sí** (ElastiCache en prod) |

Se eligió Redis aunque suma un servicio: es la herramienta estándar para contadores
efímeros y de alta frecuencia, saca esa carga de la base transaccional y queda
disponible para lo que viene en el roadmap y necesita lo mismo (colas para
recordatorios y para la notificación de crisis de PSICO).

**Ventana fija y no deslizante**: es una sola operación por request. El costo es que
en el borde entre dos ventanas pueden pasar hasta 2×límite; para frenar fuerza bruta
y spam alcanza.

### Fail-open

Si Redis no está o no responde (timeout de 250 ms, sin cola offline), el request
**pasa** y se loguea un warning. El rate-limiting es una capa de protección, no de
corrección: tumbar el login porque se cayó Redis sería peor que el riesgo que cubre.
Sin `REDIS_URL` (dev/test) el limitador queda apagado; en **producción la env lo
exige** (la API no arranca sin él).

### Reglas (por handler, con `@RateLimit`)

| Endpoint | Regla |
|---|---|
| `POST /auth/login` | 20/min por IP **y** 10 cada 15 min por email del tenant |
| `GET /invitations/lookup` | 30/min por IP |
| `POST /invitations/accept` | 10/min por IP |
| `GET` slots públicos | 60/min por IP |
| `POST` reserva pública | 5 cada 10 min por IP |

La regla por email del login se scopea al tenant (`slug|email`): el mismo email en
otra organización es otra cuenta. Pasado el límite: **429** con `Retry-After`.

### IP del cliente

- El edge (Next) toma la IP de `X-Forwarded-For` **desde la derecha**: cada proxy
  agrega a la derecha, así que la entrada `TRUSTED_PROXY_HOPS` (default 1 = ALB) es
  la que vio el primer proxy de confianza. Lo de más a la izquierda lo puede
  inventar el cliente y no se usa. Next sólo completa el header con la IP del
  socket si no vino ninguno, así que en dev (sin proxy) también aplica `1`.
- El edge la manda a la API en `x-client-ip`. La API confía en ese header porque
  `edgeSecretMiddleware` ya rechazó todo request sin el secreto compartido.

## Consecuencias

- **Prod**: hace falta un ElastiCache (Redis 7, por el `EXPIRE … NX`) alcanzable
  desde la API, `REDIS_URL` en Secrets Manager y `TRUSTED_PROXY_HOPS` correcto en la
  web. Si se suma CloudFront delante del ALB, pasa a `2`; si queda mal configurado,
  el límite por IP se aplica sobre la IP de un proxy (todos al mismo balde).
- **Sin un proxy de confianza delante** (como en dev), `X-Forwarded-For` lo controla
  el cliente y el límite por IP se puede esquivar. La regla por email del login no
  depende de la IP y sigue valiendo.
- Los usuarios detrás de una misma IP (una clínica con NAT) comparten el límite por
  IP; los números están calibrados para que un humano no los toque.
- Fuera de alcance: límites para usuarios autenticados (los agentes ya tienen el suyo
  por tenant, ver [ADR 0014](./0014-inferencia-bedrock-y-controles-de-costo.md)) y
  bloqueo progresivo de cuentas (lockout).
