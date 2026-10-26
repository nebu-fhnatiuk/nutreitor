# 0047 — Infraestructura como código con Terraform

- **Estado**: aceptada
- **Fecha**: 2026-10-26
- **Jira**: KAN-13 (Gap 1, KAN-5)

## Contexto

La topología de producción estaba descrita en prosa (overview, ADR 0028, README), sin
código. Hacía falta poder hacer `plan` y `apply` reproducibles por entorno, con el
state remoto y sin secretos en el repo, antes del primer despliegue (KAN-89).

## Decisión

- **Terraform**, en `infra/terraform/`, organizado así:
  - `modules/stack` arma un entorno completo a partir de los módulos `network`,
    `data`, `edge` y `ecs`;
  - `envs/staging` y `envs/prod` sólo cambian los tamaños;
  - `bootstrap/` crea, por cuenta, el bucket del state y el rol de deploy.

  Se eligió Terraform sobre CDK por cuatro motivos:
  - el plan es legible en una revisión;
  - el state es explícito;
  - no hay una capa de TypeScript sobre CloudFormation;
  - Terraform puede gestionar en el futuro piezas fuera de AWS (DNS, GitHub).
- **Una cuenta AWS por entorno.** Un error en staging no toca prod, y el IAM y la
  facturación quedan separados. Cada cuenta tiene su state en S3, versionado, cifrado
  con KMS y con lock nativo (`use_lockfile`, sin DynamoDB). GitHub Actions asume el
  rol de deploy por OIDC, y sólo desde el environment de GitHub del mismo nombre, que
  puede pedir aprobación.
- **Red: VPC en 2 AZ con tres capas.**
  - Las subnets públicas llevan el ALB y los NAT.
  - Las privadas llevan las tareas.
  - Las de datos llevan RDS y Redis, sin ruta a internet.
  - Hay un NAT en staging y uno por AZ en prod.
  - Un endpoint de S3 evita que las capas de ECR pasen por el NAT.
- **Todo entra por CloudFront.** El dominio raíz sirve la landing (S3 con OAC) y las
  rutas de la web por path. Este punto actualiza el ADR 0028, que mandaba los
  subdominios directo al ALB: los subdominios (`*.dominio`) ahora pasan por una
  segunda distribución sin caché. Con eso:
  - el ALB acepta conexiones sólo desde CloudFront (prefix list administrada);
  - la IP del cliente siempre queda a dos saltos en `X-Forwarded-For`
    (`TRUSTED_PROXY_HOPS=2`, KAN-15);
  - hay un único lugar donde sumar WAF.
- **ECS Fargate:**
  - web es el único servicio detrás del ALB;
  - api (`api:3001`) y agents (`agents:8000`) son internos, por Service Connect;
  - worker no tiene puertos;
  - la migración es una tarea one-off con la imagen de la API;
  - cada servicio tiene su security group y sus dos roles: el de ejecución sólo lee
    los secretos de esa tarea, y el de la tarea no tiene permisos salvo dos
    excepciones (Bedrock para agents y SES para worker), cada una detrás de su
    variable;
  - en staging todo corre en Fargate Spot.
- **Datos:**
  - **RDS Postgres 17** cifrado con la KMS del entorno, con `rds.force_ssl`, Multi-AZ
    y 14 días de backup en prod, y Performance Insights.
  - **ElastiCache Redis 7** con TLS y cifrado en reposo, sin AUTH (lo cierra el
    security group).
  - **Las conexiones a la base** usan `sslmode=verify-full` contra la CA de RDS, que
    traen las imágenes.
- **Secretos fuera del repo y del state.**
  - Terraform genera las contraseñas como valores *ephemeral* y las escribe con
    argumentos *write-only*: `password_wo` en RDS y `secret_string_wo` en Secrets
    Manager.
  - Sólo se reescriben cuando sube `credentials_version` (las de la base) o
    `app_secrets_version` (JWT, edge, agents).
  - ECS inyecta cada secreto como variable de entorno.
  - La tarea de migración, después de migrar, fija la contraseña de cada rol de
    runtime (`set-role-passwords`). Las migraciones los crean con la de desarrollo, y
    así la única fuente pasa a ser el secreto.
- **pgBouncer queda para después.** Con los tamaños actuales (≤ 6 tareas de api con
  pools chicos, más worker y agents) las conexiones entran sobradas en
  `max_connections`. Un pooler agrega un componente y una configuración de usuarios
  por rol. Se suma cuando las conexiones lo pidan. Si va, va en modo transacción: el
  `set_config(..., true)` de RLS es por transacción, así que es compatible.

## Consecuencias

- **Orden del primer despliegue:**
  1. bootstrap de cada cuenta;
  2. delegar `staging.nutreitor.com` desde la zona de prod;
  3. `apply` con `image_tag` de una imagen ya subida a ECR;
  4. correr la tarea de migración;
  5. levantar los servicios.

  El pipeline que hace todo esto es KAN-89. Esta infraestructura se entrega validada
  (`fmt` y `validate` en CI), sin `apply` real.
- **Rotar las contraseñas de la base** tiene tres pasos: subir `credentials_version`
  y hacer `apply`, correr la migración y redeployar los servicios. Entre el `apply` y
  la migración, las tareas que ya corren siguen con las conexiones abiertas, pero no
  pueden abrir nuevas.
- **Riesgo a verificar en el primer `apply` de staging:** en RDS el usuario maestro no
  es superusuario. `nutreitor_owner` es dueño de las tablas con
  `FORCE ROW LEVEL SECURITY`, así que sin `BYPASSRLS` las lecturas del plano de
  control (alta, consola, resolución de login) verían cero filas. Queda registrado
  en KAN-88, para resolverlo antes de prod; la salida de fondo es KAN-16.
- **Quedan para otros tickets:**
  - KAN-18: logs de acceso del ALB, flow logs, alarmas y WAF;
  - KAN-17: la identidad de SES.
