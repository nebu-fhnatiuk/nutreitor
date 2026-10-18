/** Color de marca por defecto (= --brand-rgb de globals.css) para manifest e íconos. */
export const DEFAULT_BRAND_HEX = "#107a57";

/** Tamaños de ícono que sirve /pwa-icon/{size} (los que pide un manifest instalable). */
export const PWA_ICON_SIZES = [180, 192, 512] as const;

/** Nombre a mostrar del consultorio en la app instalada. */
export const appName = (org: { displayName: string | null; name: string }) => org.displayName || org.name;
