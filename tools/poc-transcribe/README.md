# Prueba de concepto — transcripción en streaming (KAN-92)

Valida la arquitectura del [ADR 0050](../../docs/decisions/0050-nota-de-consulta-asistida.md)
antes de implementar KAN-95: Amazon Transcribe en streaming, con una URL `wss://`
prefirmada y el audio enviado directo a AWS, sin pasar por la API. Mide la calidad con
el vocabulario nutricional y deportivo.

No usa datos reales: el audio sale de un guion (`consulta.txt`) sintetizado con las
voces de macOS.

## Archivos

| Archivo | Para qué |
|---|---|
| `consulta.txt` | Guion de una consulta deportiva: antropometría ISAK, Kerr, suplementación, sudoración y una interacción fármaco-nutriente |
| `vocabulario.txt` | Términos para el vocabulario personalizado de Transcribe |
| `generar_audio.py` | Genera `out/consulta-mono.wav` (presencial) y `out/consulta-estereo.wav` (online, un hablante por canal) |
| `transcribir.py` | Transcribe: firma la URL, hace streaming a ritmo real y mide |
| `speechmatics.py` | Speechmatics: pide una clave temporal, hace streaming a ritmo real y mide igual |
| `evaluacion.py` | Métricas compartidas: WER, recall del vocabulario y retraso |

## Cómo correrla

Requiere macOS (`say`, `afconvert`) y credenciales de AWS con
`transcribe:StartStreamTranscriptionWebSocket` y `transcribe:CreateVocabulary`.

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
python3 generar_audio.py

# Vocabulario (una vez; tarda unos minutos en quedar READY)
aws transcribe create-vocabulary --region us-east-1 --language-code es-US \
  --vocabulary-name nutreitor-poc --phrases $(tr '\n' ' ' < vocabulario.txt)
aws transcribe get-vocabulary --region us-east-1 --vocabulary-name nutreitor-poc --query VocabularyState

# Las cuatro corridas
.venv/bin/python transcribir.py out/consulta-mono.wav
.venv/bin/python transcribir.py out/consulta-mono.wav --vocabulario nutreitor-poc
.venv/bin/python transcribir.py out/consulta-estereo.wav --canales
.venv/bin/python transcribir.py out/consulta-estereo.wav --canales --vocabulario nutreitor-poc
```

### Speechmatics

Requiere una cuenta del portal de Speechmatics, con **el entrenamiento de modelos
desactivado**. Sus términos dicen que solo se usa si lo activás, pero no aclaran cómo
viene por defecto: revisar el interruptor *Model Training* en el portal antes de
mandar audio.

```bash
export SPEECHMATICS_API_KEY=...
.venv/bin/python speechmatics.py out/consulta-mono.wav
.venv/bin/python speechmatics.py out/consulta-mono.wav --vocabulario
```

Solo mono por ahora. El caso online (un canal por hablante) se prueba si Speechmatics
pasa la comparación en presencial.

Cada corrida dura lo mismo que el audio (unos 2 minutos) y cuesta centavos de dólar.
El resultado queda en `out/*.json`; `out/` no se versiona.

## Cómo leer los números

- **WER aproximado**: sobreestima el error. Transcribe escribe los números con
  dígitos ("72") y el guion los tiene en letras ("setenta y dos"), así que cada número
  cuenta como error. Sirve para comparar corridas entre sí, no como valor absoluto.
- **Recall del vocabulario**: cuántos términos técnicos del guion aparecen bien
  escritos. Es la métrica que más importa para la nota.
- **Retraso del resultado final**: cuánto tarda en llegar un segmento final desde
  que termina la frase. Define cuán "en vivo" se siente la transcripción.

## Límites

- Las voces son de México y de España: **no miden el acento rioplatense**. Antes de
  cerrar KAN-95 hay que repetir la prueba con grabaciones reales de voces
  argentinas (por ejemplo, Matías leyendo el guion con consentimiento), con el mismo
  script.
- Las voces sintéticas no se pisan ni tienen ruido de consultorio, así que la
  diarización va a dar mejor que en una consulta real.

## Resultados

Pendiente: la primera corrida falló porque las credenciales locales de AWS estaban
vencidas. Se verificó sin AWS que los frames de event-stream se decodifican bien y
que la URL sale firmada.

| Proveedor | Corrida | WER aprox. | Recall vocabulario | Retraso mediana / p90 |
|---|---|---|---|---|
| Transcribe | mono, diarización | | | |
| Transcribe | mono, diarización + vocabulario | | | |
| Transcribe | estéreo, canales | | | |
| Transcribe | estéreo, canales + vocabulario | | | |
| Speechmatics | mono, diarización | | | |
| Speechmatics | mono, diarización + vocabulario | | | |
