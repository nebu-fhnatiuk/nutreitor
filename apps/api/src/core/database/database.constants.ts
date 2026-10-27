/** Conexión de runtime: rol nutreitor_app, sujeta a RLS. La usa TenantDbService. */
export const APP_DB = Symbol("APP_DB");

/**
 * Conexión del plano de control: rol nutreitor_control (ADR 0048), con acceso entre
 * tenants sólo a las tablas de plataforma. La usa AdminDbService. Puede no estar
 * configurada si la API no cumple rol de control-plane.
 */
export const CONTROL_DB = Symbol("CONTROL_DB");
