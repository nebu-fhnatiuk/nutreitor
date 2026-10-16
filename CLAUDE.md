# Bloque para CLAUDE.md — Documentación viva

---

## Documentación

La documentación del proyecto vive en `docs/` y se mantiene **viva**: se actualiza
en el mismo trabajo que el cambio que la afecta, nunca como tarea separada al final.
Para diagramas y documentación técnica, usar la skill `nutreitor-docs` (formato
Mermaid, español de Argentina en la prosa, inglés en los identificadores).

**Al cerrar cada sprint**, antes de darlo por terminado, revisar y actualizar lo que
corresponda:

- Cambió/se agregó una tabla → actualizar el `erDiagram` y las notas de RLS en
  `docs/architecture/data-model.md`.
- Cambió/se agregó un flujo de negocio → actualizar el `.md` del flujo en
  `docs/flows/`.
- Se tomó una decisión de arquitectura con trade-offs → registrar un ADR en
  `docs/decisions/`.
- Cambió la arquitectura de componentes → actualizar
  `docs/architecture/overview.md`.

No escribir documentación de relleno: si un cambio no toca nada de lo anterior, no
hay doc que actualizar. La doc refleja lo que existe.

**Al terminar el sprint**, mencionar explícitamente qué documentos se actualizaron
(o que no hizo falta ninguno), para que quede claro que la doc quedó en sincronía.