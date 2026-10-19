# 0029 — Recuperar la contraseña

- **Estado**: aceptada
- **Fecha**: 2026-10-19

## Contexto

No había forma de recuperar una contraseña olvidada: ni profesionales, ni pacientes,
ni operadores de plataforma. La identidad es **global** (ADR 0003): una persona tiene
una sola contraseña para todas sus organizaciones y para la consola.

## Decisión

- **Pedido** (`POST /auth/password/forgot`, sin sesión): la respuesta es siempre 202,
  exista o no la cuenta. Tiene rate-limit por IP (10/h) y por email (3/h). Si la cuenta
  existe, se manda un link de **un solo uso** que vence en `PASSWORD_RESET_TTL_MIN`
  (60 min). El link vuelve **a donde se pidió**: el subdominio de la organización si el
  pedido llegó con `x-tenant-slug` de una org real, o el dominio raíz (consola) si no.
- **Token**: opaco de 256 bits; en la base solo el `sha256`, en `password_resets`. Es
  plano de control, como `users`: sin tenant, sin RLS y **sin grants al rol app**.
- **Restablecer** (`POST /auth/password/reset`): en una transacción reclama el token
  (CAS, un solo uso), guarda la contraseña nueva, marca `users.password_changed_at`,
  anula los otros links abiertos de la cuenta y **revoca todos los refresh tokens**:
  se cierran todas las sesiones. También borra las cookies del navegador que hizo el
  cambio.
- **Consola de plataforma**: su sesión (JWT de 2 h sin refresh) deja de valer si se
  emitió antes de `password_changed_at`. El guard ya consulta al usuario en cada
  request, así que no hay costo extra.
- Una sesión de tenant ya emitida (access token de 15 min) termina sola; no se renueva
  porque su refresh token está revocado.
- `olvide` y `restablecer` se suman a los slugs reservados de perfiles: las páginas
  conviven con `/{perfil}` en el subdominio.

## Alternativas descartadas

- **Link mágico de login (sin contraseña)**: cambia el modelo de auth para todos; se
  puede sumar después.
- **Preguntas de seguridad / SMS**: más débiles que un link por mail o más caros.
- **Revocar también los access tokens al instante**: requeriría consultar
  `password_changed_at` en cada request del workspace. 15 min de ventana se consideran
  aceptables frente a ese costo; la consola sí lo hace porque ya consulta.

## Consecuencias

- Depende del mail: en dev el link sale en los logs de la API; en prod necesita el
  adapter de SES (pendiente en "antes de producción").
- El cambio no queda en el `audit_log` de ninguna org (es identidad global, sin
  tenant): cuando exista el registro de seguridad de plataforma, va ahí.
