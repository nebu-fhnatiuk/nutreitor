# 0014 — Inferencia real vía AWS Bedrock + controles de costo por tenant

- **Estado**: aceptada (provider real detrás de flag, default `stub`)
- **Fecha**: 2026-06-05

## Contexto

El [ADR 0013](./0013-agentes-servicio-ia.md) dejó el servicio de agentes andando
end-to-end con un **provider stub** (sin IA real, sin PHI a la nube). Para activar la
inferencia real hay que decidir **por dónde** se accede a Claude y **cómo** se
controla el costo/abuso — son decisiones con trade-offs legales y de arquitectura,
no sólo de código.

Contexto del producto: Nutreitor maneja **datos de salud** (dato **sensible**), la
infraestructura ya vive en **AWS**, y la dueña es arquitecta AWS.

## Decisión

### Vía de acceso: AWS Bedrock (no la API directa de Anthropic)

Claude se consume vía **Amazon Bedrock** (`bedrock-runtime`, **Converse API**), no
por la API pública de Anthropic.

| | API Anthropic directa | **Bedrock (elegido)** |
|---|---|---|
| Dónde se procesa el PHI | Sale a Anthropic (US) | **Dentro de la cuenta AWS**, región elegida |
| Cobertura legal | BAA **con Anthropic** | Cubierto por el **BAA de AWS** (Bedrock es HIPAA-eligible) |
| Proveedores/contratos | Suma uno nuevo | El que ya tenemos |
| Facturación | Aparte | Consolidada en AWS |
| Precio | Igual | Prácticamente igual |

El dato no se usa para entrenar y no se retiene más allá del request en ninguno de
los dos; Bedrock evita sumar un tercero y mantiene el PHI en el perímetro AWS.

### Postura de cumplimiento (importante: no es sólo "HIPAA")

- "BAA" es un concepto **HIPAA (US)**. Si los pacientes están en **Argentina**, lo
  que rige es la **Ley 25.326** + AAIP: la salud es **dato sensible** (requiere
  **consentimiento explícito**) y mandarla a un modelo alojado en **US** es una
  **transferencia internacional** (art. 12) que exige resguardos contractuales y/o
  consentimiento informado.
- Por eso el provider real queda **detrás de `INFERENCE_PROVIDER`** y **no se activa**
  hasta cerrar: (a) el lado contractual (BAA de AWS / DPA), y (b) el **consentimiento
  del paciente** para procesamiento por IA, asentado en el producto.
- Mientras tanto, `stub` es el default seguro: ejercita todo el pipeline (firma, RLS,
  contexto, persistencia, audit, **tope de costo**) sin que ningún PHI salga.

### Modelo y caching

- Default **Claude Sonnet 4.x** (`BEDROCK_MODEL_ID`): mejor relación calidad/precio
  para un asistente de ficha. Opus es overkill; Haiku queda para tareas simples.
- **Prompt caching** sobre el bloque estable (system prompt + contexto del paciente):
  el prefijo se lee al ~10% del precio de input en los turnos siguientes del hilo.
- System prompt **por agente** (NUTRI/CHEF), acotando rol y seguridad; el output
  sigue siendo **borrador que revisa el profesional**.

### Controles de costo/abuso — en el gateway, por tenant

Se evalúan en el **gateway Nest** *antes* de firmar el contexto y egresar; si el
tenant se pasó, se corta con **429** y no sale nada (ni PHI ni costo):

- **Rate-limit**: máximo de llamadas por minuto por tenant (`AGENTS_RATELIMIT_PER_MIN`).
- **Tope mensual de tokens**: suma `input+output` del mes corriente por tenant
  (`AGENTS_MONTHLY_TOKEN_CAP`, 0 = sin límite).

El uso se deriva del audit **`agent_runs`** (las mismas filas que escribe el servicio
Python, con `input_tokens`/`output_tokens` reales), leído **bajo RLS**. El tope es
post-hoc por naturaleza: los tokens se conocen después, así que se mide lo
**acumulado** antes de habilitar la siguiente llamada. El stub estima tokens
(~4 chars/token) para que el tope sea ejercitable en dev.

## Consecuencias

- **A favor**: PHI no sale de AWS; sin proveedor nuevo; costo acotado y observable por
  tenant; activación es flip de flag + credenciales, sin re-arquitectura.
- **En contra / pendiente**: Claude en Bedrock hoy vive en regiones **US** → hay
  transferencia internacional igual (decisión legal, no técnica). El tope por tenant
  usa un valor **global** por env; un override por-tenant (columna/tabla) queda para
  cuando haga falta tarifar distinto. La llamada Bedrock real **no está probada en
  vivo** (sin credenciales en dev); el camino testeado es stub + tope.
- **Seguridad**: el texto clínico podría traer *prompt injection*; mitiga en parte que
  el output es borrador a revisar + el system prompt que fija el rol. PSICO (futuro)
  necesita guardrails más duros (crisis + escalamiento humano + consentimiento).

## Alternativas descartadas

- **API Anthropic directa**: más simple de arrancar, pero saca el PHI de AWS y suma un
  BAA/contrato aparte.
- **Self-host de un modelo abierto**: control total del dato, pero costo operativo y
  calidad clínica no justificables hoy.
- **Tope en el servicio Python**: se prefirió el **gateway** (control plane) para
  cortar *antes* de cruzar el borde del proceso.
