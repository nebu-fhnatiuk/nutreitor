import { Module } from "@nestjs/common";

/**
 * Agendamiento de citas. Placeholder modular (etapa 2 del recorrido).
 *
 * DECISIÓN DE ARQUITECTURA PENDIENTE (a presentar con trade-offs antes de
 * implementar): Cal.com self-hosted vs motor de scheduling propio.
 *   - Cal.com self-hosted: time-to-market, manejo de husos/DST/buffers ya
 *     resuelto, pero acopla un sistema externo y su modelo de datos al multi-tenant.
 *   - Motor propio: control total del modelo (tenant_id/region nativos, RLS),
 *     a costa de reimplementar husos horarios, DST por país y disponibilidad.
 *
 * Invariante ya fijado: storage en UTC, conversión en presentación, DST por país.
 */
@Module({})
export class SchedulingModule {}
