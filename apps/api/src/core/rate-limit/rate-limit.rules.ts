import type { RateLimitRule } from "./rate-limiter.js";

/**
 * Reglas de los endpoints expuestos sin sesión (o previos a ella). Los números
 * están pensados para que un humano nunca los toque y un script sí: si un usuario
 * real choca con alguno, la regla está mal calibrada.
 */

/** Login: tope por IP (rociado de cuentas) y por email del tenant (fuerza bruta). */
export const LOGIN_BY_IP: RateLimitRule = { name: "login-ip", limit: 20, windowSec: 60, by: "ip" };
export const LOGIN_BY_EMAIL: RateLimitRule = {
  name: "login-email",
  limit: 10,
  windowSec: 15 * 60,
  by: "email",
};

/** Invitaciones: el token es opaco, pero el lookup no debe servir de oráculo. */
export const INVITE_LOOKUP: RateLimitRule = { name: "invite-lookup", limit: 30, windowSec: 60, by: "ip" };
export const INVITE_ACCEPT: RateLimitRule = { name: "invite-accept", limit: 10, windowSec: 60, by: "ip" };

/** Vidriera: los slots son lectura barata; la reserva crea un paciente lead. */
export const PUBLIC_SLOTS: RateLimitRule = { name: "public-slots", limit: 60, windowSec: 60, by: "ip" };
export const PUBLIC_BOOK: RateLimitRule = { name: "public-book", limit: 5, windowSec: 10 * 60, by: "ip" };

/**
 * Alta de organizaciones (dominio raíz): cada alta manda un mail, así que se acota
 * por IP y por email (no sirve para bombardear una casilla). La disponibilidad del
 * slug es lectura barata.
 */
export const SIGNUP_BY_IP: RateLimitRule = { name: "signup-ip", limit: 10, windowSec: 60 * 60, by: "ip" };
export const SIGNUP_BY_EMAIL: RateLimitRule = { name: "signup-email", limit: 3, windowSec: 60 * 60, by: "email" };
export const SIGNUP_SLUG: RateLimitRule = { name: "signup-slug", limit: 60, windowSec: 60, by: "ip" };
export const SIGNUP_LOOKUP: RateLimitRule = { name: "signup-lookup", limit: 30, windowSec: 60, by: "ip" };
export const SIGNUP_CONFIRM: RateLimitRule = { name: "signup-confirm", limit: 10, windowSec: 60, by: "ip" };

/**
 * Consulta desde la vidriera (ADR 0027): cada una llega a la bandeja de alguien y
 * dispara un acuse por mail. Por IP y por email (no sirve para spamear a un
 * profesional ni a una casilla).
 */
export const PUBLIC_CONTACT_BY_IP: RateLimitRule = { name: "public-contact-ip", limit: 5, windowSec: 10 * 60, by: "ip" };
export const PUBLIC_CONTACT_BY_EMAIL: RateLimitRule = { name: "public-contact-email", limit: 3, windowSec: 60 * 60, by: "email" };

/**
 * Recuperar la contraseña (ADR 0029): cada pedido manda un mail, así que se acota por
 * IP y por email (no sirve para bombardear una casilla ni para tantear cuentas).
 */
export const FORGOT_BY_IP: RateLimitRule = { name: "forgot-ip", limit: 10, windowSec: 60 * 60, by: "ip" };
export const FORGOT_BY_EMAIL: RateLimitRule = { name: "forgot-email", limit: 3, windowSec: 60 * 60, by: "email" };
export const RESET_LOOKUP: RateLimitRule = { name: "reset-lookup", limit: 30, windowSec: 60, by: "ip" };
export const RESET_CONFIRM: RateLimitRule = { name: "reset-confirm", limit: 10, windowSec: 60, by: "ip" };

/** Consulta comercial desde la landing (KAN-80): pocas por IP y por email. */
export const LEAD_BY_IP: RateLimitRule = { name: "lead-ip", limit: 5, windowSec: 10 * 60, by: "ip" };
export const LEAD_BY_EMAIL: RateLimitRule = { name: "lead-email", limit: 3, windowSec: 60 * 60, by: "email" };
