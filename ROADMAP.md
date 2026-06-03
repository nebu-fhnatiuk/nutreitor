Roadmap — Nutreitor
Plan de trabajo por sprints para la plataforma multi-tenant de captación y
seguimiento de pacientes.
Este documento es la referencia viva del backlog. Se versiona en el repo y se
va tildando a medida que se completa cada tarea. Cada sprint está pensado para
dejar algo funcional y demostrable (corte por flujo de valor, no por capa
técnica): cada uno cierra una porción del recorrido del usuario end-to-end.
Convención de estado:

[ ] pendiente
[~] en curso
[x] hecho


Estado actual — Fundación (cerrado)
La base sobre la que se construye todo lo demás. No se reabre; los sprints
siguientes construyen encima.

 Monorepo containerizado (pnpm workspaces + Turborepo, docker compose up)
 Multi-tenant pool con Row Level Security en Postgres (fail-closed)
 Separación de roles de Postgres: nutreitor_owner (control plane, bypassa
RLS) vs nutreitor_app (runtime, FORCE ROW LEVEL SECURITY)
 tenant_id y region como ciudadanos de primera clase en el modelo
 Inyección de tenant por transacción (set_config / SET LOCAL),
compatible con transaction-pooling
 Resolución de tenant subdomain-first ({slug}.dominio → rewrite interno)
 Auth self-hosted: JWT en cookie httpOnly + refresh token rotativo persistido
 Modelo de identidad global con memberships multi-org y roles
(admin / professional / patient)
 Guard que valida firma → matchea org del subdominio contra el JWT →
verifica membership → setea contexto RLS
 Landing pública de producto + scaffolding de los dashboards
 Slot reservado para el módulo de agentes (vacío, desacoplado)


Sprint 0 — Endurecer lo existente
Cerrar lo que salió de la revisión de código antes de sumar features. Barato
ahora, caro después. También monta el andamiaje que hace falta en todos los
sprints siguientes.
Seguridad (de la revisión):

 Corregir el timing oracle del login: ejecutar bcrypt.compare contra un
hash dummy aunque falten user o membership, para igualar el tiempo de
respuesta y evitar enumeración de membership (filtración de dato sensible)
 Definir el borde de red de la API: que no sea alcanzable salvo a través del
edge (el header x-tenant-slug no debe poder setearse desde afuera)

Consistencia de modelo (de la revisión):

 Unificar el tipo de region a enum en memberships y refresh_tokens
(hoy es text; en organizations es enum)
 Decidir: ¿region se denormaliza en esas tablas o se deriva de
organizations? Documentar la decisión

Andamiaje:

 Pipeline de CI: lint, typecheck, tests, build de imágenes
 Test e2e de aislamiento RLS corriendo en CI como red de seguridad permanente
 Manejo de secrets y config por entorno (dev / staging / prod)


Sprint 1 — Gestión de organizaciones y usuarios (panel admin)
Hoy las orgs y usuarios existen solo por seed. Para que sea vendible, un admin de
tenant tiene que poder operar su organización.

 Invitar profesionales y pacientes a la organización
 Asignar y editar roles; gestionar membership (alta/baja)
 Configuración de la organización (datos, branding white-label: logo, colores)
 Flujo de aceptación de invitación + alta de credencial del invitado
 Listado y búsqueda de miembros de la org


Sprint 2 — Perfil profesional y capa pública de captación
Primera etapa del recorrido del paciente: cómo un visitante conoce al profesional
y se convierte en lead.

 Perfil del profesional editable (bio, credenciales, servicios, foto)
 Renderizado en la capa pública SSR e indexable, con la marca del tenant
 CTA de contacto / solicitud (placeholder hacia el agendamiento)
 SEO básico (metadatos, sitemap por tenant)


Sprint 3 — Agendamiento con zonas horarias
El módulo que más esfuerzo esconde. Decisión a cerrar antes de implementar:
Cal.com self-hosted vs motor propio (recomendación: integrar para arrancar).
Sprint pesado; puede partirse en dos.

 Decisión de arquitectura: Cal.com self-hosted vs motor propio (trade-offs)
 Disponibilidad del profesional (horarios, slots, bloqueos)
 Reserva de cita por parte del paciente
 Almacenamiento en UTC + conversión en presentación
 Manejo de DST por país (los husos cambian en fechas distintas)
 Notificaciones de cita (confirmación, recordatorio)
 Gestión de citas desde el dashboard profesional (ver, reprogramar, cancelar)


Sprint 4 — Planes alimentarios (corazón clínico)
El terreno donde el criterio lo aporta el profesional. La plataforma da la
estructura; el contenido clínico es del nutricionista.

 Modelo del plan diario con horarios de comidas (JSONB ya previsto)
 Definir estructura clínica: campos del plan, estructura de comida,
alternativas, cantidades (input del profesional)
 Editor del plan desde el dashboard profesional
 Visualización del plan desde el dashboard del paciente
 Versionado del plan (historial de cambios)


Sprint 5 — Seguimiento y métricas
Cierra el loop entre profesional y paciente. Es lo que diferencia "te di un PDF"
de "te hago seguimiento".

 Carga de métricas del paciente (peso, medidas, las que se definan)
 Visualización de evolución en el dashboard del paciente
 Vista de progreso en el dashboard profesional
 Herramientas del profesional para ajustar el plan según evolución


Sprint 6 — Compliance y data governance
No es feature, es condición para venderle a clínicas y hospitales. Se encara
cuando ya hay datos reales fluyendo.

 Auditoría de accesos a datos de salud (log inmutable de quién vio qué)
 Política de retención y borrado de datos
 Export de datos del paciente (portabilidad — GDPR)
 Gestión de consentimientos
 Documentación de compliance según los regímenes que apliquen por región
de venta (GDPR / HIPAA / Ley 25.326)


Backlog (fuera de sprints, para no perderlos)
Items grandes que entran cuando la base de negocio esté madura o cuando un
requisito concreto los dispare.

 Agentes CHEF / NUTRI / PSICO: servicio Python sobre el slot reservado.
Requiere capa de orquestación tenant-scopeada, guardrails, y BAA con el
proveedor de inferencia. PSICO con detección de crisis y escalamiento humano.
 MFA: probablemente conviene adelantarlo si se manejan datos de salud en
serio (candidato a entrar antes que varios items de este backlog)
 Federación SSO / SAML por tenant: el requisito real de enterprise. Se
implementa sobre el modelo de identidad global actual, sin migrarlo.
 Identidad por-tenant: solo si un cliente exige no-correlación entre orgs
o aislamiento estricto de credenciales. Migración costosa (afecta la PK de
identidad); decidir con intención, no por inercia.
 Promoción pool → silo: mover un tenant a su propio schema/instancia bajo
demanda. La lógica de negocio no cambia (solo el routing de conexión).


Nota sobre el orden de los sprints
El orden actual (admin → captación → agendamiento → planes → métricas) asume
prioridad producto vendible-a-terceros lo antes posible.
Si la prioridad real fuera validar primero con la práctica propia (un único
profesional, sin gestión multi-org), conviene adelantar los Sprints 4 y 5
(planes y métricas) por encima del Sprint 1, porque para uso personal el seed
de la fundación alcanza y no hace falta el panel admin todavía. El resto del orden
se mantiene.