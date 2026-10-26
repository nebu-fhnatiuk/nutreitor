# 0046 — Región de producción: sa-east-1, con Bedrock en us-east-1

- **Estado**: aceptada
- **Fecha**: 2026-10-26
- **Jira**: KAN-19 (Gap 1, KAN-5)

## Contexto

Los clientes son clubes, gimnasios y nutricionistas de Argentina, y el dato es de
salud. La Ley 25.326 restringe la transferencia internacional de datos personales a
países sin protección adecuada, salvo consentimiento expreso o garantías
contractuales. El enum `region` (ADR 0004) ya admite `sa-east-1`, `us-east-1` y
`eu-central-1`; faltaba decidir dónde corre producción.

Opciones:

1. **us-east-1**:
   - es la más barata;
   - tiene todos los modelos de Bedrock en la región;
   - suma unos 150 ms más de latencia desde Buenos Aires;
   - el dato clínico vive en EE.UU., y eso exige cláusulas de transferencia y
     consentimiento para todo, no sólo para la IA.
2. **sa-east-1 con todo adentro**: la menor latencia y el dato en Sudamérica. Pero
   Bedrock en São Paulo sirve los modelos de Anthropic sólo por inferencia
   cross-region, y la región donde se ejecuta queda en manos de AWS.
3. **sa-east-1 para la app y los datos, con Bedrock llamado de forma explícita en
   us-east-1**.

## Decisión

**Opción 3.**

- **La app y los datos corren en sa-east-1:**
  - RDS;
  - ElastiCache;
  - las tareas de ECS;
  - los backups;
  - los logs;
  - los secretos.
- **Bedrock se llama en us-east-1**, sólo desde el servicio de agentes:
  - la región se configura aparte (`BEDROCK_REGION`), separada de la región del
    proceso;
  - el permiso de IAM nombra los modelos permitidos;
  - con un perfil de inferencia `us.`, el modelo puede correr en cualquier región de
    EE.UU., y el permiso lo cubre así.
- **Bedrock está apagado por defecto** (`bedrock_enabled = false`): agents corre con
  el stub hasta que estén el BAA, el consentimiento y las cuotas (KAN-52).

## Consecuencias

- La única transferencia internacional del dato clínico es el prompt de los agentes,
  y queda acotada a un servicio, un permiso y una variable. Es lo que se declara en
  el consentimiento y en el dossier de compliance.
- sa-east-1 cuesta más que us-east-1, del orden de 30 a 50 % en RDS y Fargate.
- **Los mails salen por SES en sa-east-1**, la misma región que el resto (KAN-17).
- **Los certificados de CloudFront** se emiten en us-east-1 porque CloudFront lo
  exige. No hay datos ahí.
- **El alta autoservicio ya usa `sa-east-1` por defecto** (`signupSchema`). Las
  organizaciones del seed de desarrollo usan otras regiones, pero el seed no corre
  en producción.
