# 0025 — Alta autoservicio de organizaciones, con aprobación y consola de plataforma

- **Estado**: aceptada
- **Fecha**: 2026-10-18

## Contexto

Hasta ahora una organización se creaba a mano (`POST /admin/organizations`, sin
guard) o por seed. Para salir a producción hace falta que un consultorio o un
profesional independiente se registre solo. Al mismo tiempo, es un producto de salud:
una vidriera pública de "consultorio" que recibe datos de pacientes no puede quedar
operativa sin que nadie la mire.

## Decisión

- **Alta autoservicio con aprobación.** En `nutreitor.com/registro`, en dos pasos:
  1. Se cargan los datos (tipo, nombre, dirección, quien administra, matrícula) y
     se guarda una solicitud (`org_signups`, con el token hasheado). No se crea nada
     hasta probar el email. La respuesta es la misma haya o no cuenta con ese email.
  2. El link de verificación crea, en una transacción: el usuario (o reusa el
     existente, como las invitaciones), la org en **`pending_review`**, la membresía
     admin y el perfil con la matrícula **declarada**. El link es de un solo uso.
- **Estados de la org**: `pending_review → active | rejected`, `active ⇄ suspended`.
  - En revisión: se entra y se configura todo, pero la vidriera no existe (404) y no
    se pueden invitar pacientes.
  - Rechazada o suspendida: no se entra (403 después de validar la contraseña; a
    quien no la sabe no se le dice nada). La vidriera tampoco existe.
- **Tipo de org**: `team` o `individual`. El independiente es una org de una persona
  (admin que atiende); la UI simplificada llega en el PR siguiente.
- **Matrícula declarada + revisión**: número y jurisdicción en el perfil. Sólo un
  perfil con la matrícula **`reviewed`** aparece en la vidriera, en el roster y en
  la reserva pública. Aprobar una org revisa las matrículas que el operador tenía a
  la vista. Cambiar la matrícula la devuelve a `declared` (lo hace un trigger: el
  rol app no puede escribir el estado). Todavía no se valida contra un registro
  oficial, por eso la vidriera muestra "Matrícula N° X", no "verificada".
- **Consola de plataforma** en `nutreitor.com/plataforma`, con sesión propia:
  - operadores = `users.is_platform_admin` (se marca a mano, ningún endpoint lo da);
  - cookie `platform_token` host-only del dominio raíz (no viaja a subdominios),
    JWT con `aud` propio (un token de tenant no sirve ni al revés), 2 h sin refresh,
    y el guard re-chequea el flag en cada request y rechaza requests con subdominio;
  - alcance mínimo: metadatos de la org, nombre y email de sus admins y matrículas.
    **Nunca datos de pacientes.** Cada decisión queda en el audit de la org afectada
    con el operador como actor, y se avisa por mail.
  - El viejo `POST /admin/organizations` queda detrás de esta sesión.
- **Defensa en profundidad por GRANT**: el rol app pasa de UPDATE de tabla a UPDATE
  por columna en `organizations` (sólo branding y textos públicos) y en
  `professional_profiles` (todo salvo el estado de la matrícula). Ni un bug en un
  servicio puede auto-aprobar una org o una matrícula.

## Alternativas descartadas

- **Autoservicio inmediato**: menos fricción, pero cualquiera publica un
  "consultorio" y recibe datos de pacientes sin revisión.
- **Sólo por invitación de la plataforma**: lo más controlado, no escala.
- **Crear la org al enviar el formulario** (y verificar después): reserva slugs con
  emails no probados y deja orgs basura.
- **Auto-login al confirmar**: la confirmación pasa en el dominio raíz y la sesión
  es una cookie host-only del subdominio; habría que pasar un token de traspaso. Se
  prefirió redirigir al login del subdominio con el email puesto.
- **Verificación obligatoria contra un registro oficial**: no hay hoy una fuente
  integrable; queda para más adelante.

## Consecuencias

- Hay operación humana en el alta: alguien tiene que mirar la consola (llega un
  mail por cada alta).
- Los mails del alta salen por el `MailSender` de la API (hoy el adapter de consola;
  el de SES es parte de "antes de producción").
- La aceptación de términos del formulario necesita los textos legales reales.
- Mientras no haya validación contra un registro, la revisión de la matrícula
  depende de que el operador la busque a mano.
