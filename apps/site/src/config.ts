/**
 * Enlaces hacia la app. En prod la landing y la app comparten nutreitor.com
 * (CloudFront rutea por path), así que el alta es un link relativo; en dev la
 * landing corre aparte (4321) y apunta a la web (3000).
 */
const appOrigin = (import.meta.env.PUBLIC_APP_ORIGIN ?? "").replace(/\/$/, "");

export const links = {
  signup: `${appOrigin}/registro`,
  workspaceLogin:
    import.meta.env.PUBLIC_WORKSPACE_URL_TEMPLATE ?? "https://{slug}.nutreitor.com/login",
};

export const site = {
  name: "Nutreitor",
  tagline: "La plataforma del nutricionista deportivo",
  description:
    "Planes por día de entrenamiento, composición corporal y seguimiento de cada deportista en un solo lugar. Para nutricionistas deportivos, clubes y gimnasios.",
};
