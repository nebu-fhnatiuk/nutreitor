# 0016 — Módulos/complementos instalables por organización (entitlements)

- **Estado**: aceptada
- **Fecha**: 2026-06-05

## Contexto

Los agentes de IA (ADRs 0013–0015) no deberían estar prendidos para todas las orgs:
son un **complemento** con su propio costo/contrato. La dueña pidió que se puedan
**instalar por organización**, **apagados por default**, con su modelo comercial
aparte. Esto introduce **entitlements a nivel tenant**: una dimensión nueva,
ortogonal a las capacidades por rol.

## Decisión

### Sistema de módulos genérico (no un flag de agentes)

Tabla **`org_modules`** (tenant-scoped, RLS) con una fila por `(tenant, module)`:
`module` (text, extensible sin migración de tipo), `status` (active|inactive),
`plan`, `terms_version`, `installed_by`, `installed_at`, `uninstalled_at`. Hoy el
único módulo cableado es **`agents`**; mañana agendamiento/vidriera/etc. pueden ser
complementos sin re-arquitectura. El catálogo (nombre, blurb, planes, términos) es
estático en `@nutreitor/shared` (`MODULE_CATALOG`).

### Gating ortogonal a las capacidades, server-enforced

Decorador **`@RequireModule('agents')`** + **`ModuleGuard`** (después de
JwtAuthGuard + CapabilityGuard): aunque el rol tenga la capability, si la org no
tiene el módulo **activo**, corta con **403**. Aplicado a los controllers de agentes
(profesional y portal). **No alcanza con ocultar la UI**: el corte es en el servidor.
Para la UI, los módulos activos viajan en `/me` y en `portal/me` (`modules: string[]`).

### Instalación = aceptación de términos + plan (sin cobro real todavía)

El **admin** (capability `org:manage_modules`) instala desde *Configuración →
Complementos*: elige **plan** y **acepta los términos** (se registra versión + quién
+ cuándo). **No hay pasarela de pago**: el cobro es una épica aparte; hoy se asienta
el consentimiento comercial. Install/uninstall quedan en `audit_log`
(`module.installed` / `module.uninstalled`).

### Desinstalar es soft

`status='inactive'` + `uninstalled_at`. **Se conservan** conversaciones,
consentimientos y runs (audit/historial). Reinstalar reactiva sin perder nada.

## Consecuencias

- **A favor**: add-on comercial real sin cambiar la arquitectura de cada feature; el
  gating es declarativo y se reusa para futuros módulos; el lado legal/comercial queda
  asentado (términos + plan + audit) sin bloquear en una integración de pagos.
- **En contra / pendiente**: no hay **cobro real** (pasarela = épica futura: webhooks,
  facturación, impuestos AR); el plan es un identificador sin tarifa efectiva; el
  catálogo es estático en código (mañana podría ser DB-driven). Dos gates conviven y
  hay que tenerlos claros: **módulo instalado** (comercial, por tenant) y **provider
  real de IA** (legal/global, ADR 0014) — un tenant puede tener el módulo activo y aun
  así correr en `stub` hasta que se firme el BAA.

## Alternativas descartadas

- **Flag específico de agentes** (`organizations.agents_enabled`): más simple, pero
  cada complemento futuro re-implementaría el gating.
- **Provisión desde el control-plane** (Nutreitor activa por afuera): no le da
  autonomía a la org; se prefirió el autoservicio del admin con términos + audit.
- **Integrar pasarela de pago ahora**: épica grande; no es un paso chico ni bloqueante
  para tener el add-on instalable.
