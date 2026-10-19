/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Origen de la app (alta, consola). Vacío en prod: mismo dominio vía CloudFront. */
  readonly PUBLIC_APP_ORIGIN?: string;
  /** Login de cada organización; `{slug}` se reemplaza. */
  readonly PUBLIC_WORKSPACE_URL_TEMPLATE?: string;
}
