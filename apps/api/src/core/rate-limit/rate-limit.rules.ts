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
