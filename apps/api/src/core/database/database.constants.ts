/** Conexión de runtime: rol nutreitor_app, sujeta a RLS. La usa TenantDbService. */
export const APP_DB = Symbol("APP_DB");

/**
 * Conexión de administración: rol nutreitor_owner, BYPASSA RLS. Sólo para
 * operaciones de plataforma (alta/listado de organizaciones). La usa AdminDbService.
 * Puede no estar configurada si la API no cumple rol de control-plane.
 */
export const OWNER_DB = Symbol("OWNER_DB");
