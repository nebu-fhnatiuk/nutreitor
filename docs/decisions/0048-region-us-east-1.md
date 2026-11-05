# 0048 — Región de producción: us-east-1

- **Estado**: aceptada
- **Fecha**: 2026-11-05
- **Reemplaza**: [ADR 0046](0046-region-de-produccion.md)

## Contexto

El ADR 0046 puso la app y los datos en sa-east-1 y dejó sólo a Bedrock en us-east-1.
Estimaba que sa-east-1 costaba de 30 a 50 % más. Con los precios on-demand de AWS del
2026-11-05, la diferencia es mayor:

| Recurso | us-east-1 | sa-east-1 | Diferencia |
|---|---|---|---|
| Fargate x86, por vCPU-hora | US$ 0,04048 | US$ 0,0696 | +72 % |
| RDS `db.t4g.small` Single-AZ, por hora | US$ 0,032 | US$ 0,069 | +116 % |
| NAT Gateway, por hora | US$ 0,045 | US$ 0,093 | +107 % |

Con el mismo código, un entorno chico de producción sale unos US$ 155 por mes en
us-east-1 y unos US$ 270 en sa-east-1. La configuración actual de `envs/prod`, unos
US$ 428 contra US$ 783, sin IA ni impuestos.

## Decisión

**Todo corre en us-east-1:** RDS, ElastiCache, las tareas de ECS, los backups, los
logs, los secretos, SES y Bedrock. También es la región por defecto del alta
autoservicio (`orgSignupSchema`).

Lo decidieron los socios para priorizar el costo mientras el producto no tenga
ingresos.

`BEDROCK_REGION` sigue separada de la región del proceso: si la app vuelve a otra
región, Bedrock no tiene que moverse con ella.

## Consecuencias

- **Legal: el dato clínico completo vive en EE.UU.**, no sólo el prompt de los
  agentes. La transferencia internacional (Ley 25.326) alcanza a todo el producto, y
  el consentimiento y las garantías contractuales tienen que cubrirlo antes de cargar
  pacientes reales. Falta la revisión legal.
- **Latencia:** suma unos 150 ms desde Buenos Aires (estimación del ADR 0046). Hay que
  comprobarla con uso real.
- **Certificados:** los dos de ACM quedan en la misma región. Se mantienen separados
  para no cambiar el módulo `edge`.
- **Los demás valores del enum `region` no cambian.** Volver a otra región es una
  migración de datos planificada, no un cambio de variable.

## Alternativas descartadas

- **Mantener el ADR 0046:** menos latencia y los datos en Sudamérica, a unos US$ 115
  más por mes en un entorno chico. Sin confirmación legal de que Brasil dé una ventaja
  frente a EE.UU., no justifica el sobrecosto hoy.
- **Usar Llama para abaratar:** no cambia el costo de la infraestructura, y Claude
  Haiku 5.5 sale menos por token que los modelos de Llama disponibles en Bedrock.
