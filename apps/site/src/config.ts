/**
 * Enlaces hacia la app. En prod la landing y la app comparten nutreitor.com
 * (CloudFront rutea por path), así que el alta es un link relativo; en dev la
 * landing corre aparte (4321) y apunta a la web (3000).
 */
const appOrigin = (import.meta.env.PUBLIC_APP_ORIGIN ?? "").replace(/\/$/, "");

export const links = {
  signup: `${appOrigin}/registro`,
  /** POST del formulario "Hablemos para tu club" (KAN-80): lo recibe la web y vuelve acá. */
  leadForm: `${appOrigin}/api/form/leads`,
  workspaceLogin:
    import.meta.env.PUBLIC_WORKSPACE_URL_TEMPLATE ?? "https://{slug}.nutreitor.com/login",
};

export const site = {
  name: "Nutreitor",
  tagline: "La plataforma del nutricionista deportivo",
  description:
    "Antropometría ISAK, planes por día de partido, entreno o descanso, la pizarra del plantel y el portal de cada deportista con los colores de su club. Para nutricionistas deportivos, clubes y gimnasios.",
};
