#!/bin/sh
# Lighthouse contra el build estático de la landing (KAN-79), no contra el dev server.
#
#   docker compose exec api sh -c "cd /app && pnpm --filter @nutreitor/site build"
#   docker compose exec -d site sh -c "cd /app/apps/site && npx astro preview --host 0.0.0.0 --port 4322 --allowed-hosts site"
#   docker compose --profile tools run --rm --no-deps screenshots ./lh.sh
#
# Salida: out/lighthouse/<celular|escritorio>-<página>.json y una línea de puntajes
# por página. En local "is-on-https" y "redirects-http" fallan siempre (el preview es
# http); en producción CloudFront sirve HTTPS y HTTP/2. /ingresar tiene noindex a
# propósito (SEO 66).
BASE=${BASE:-http://site:4322}
CHROME=$(ls -d /ms-playwright/chromium-*/chrome-linux/chrome | head -1)
export CHROME_PATH="$CHROME"
mkdir -p out/lighthouse
for form in mobile desktop; do
  for p in / /clubes /gimnasios /ingresar; do
    name=$(echo "$p" | sed 's#^/$#inicio#; s#^/##')
    preset=""; [ "$form" = desktop ] && preset="--preset=desktop"
    npx -y lighthouse@12.2.1 "$BASE$p" $preset --quiet --chrome-flags="--headless=new --no-sandbox --disable-dev-shm-usage" \
      --only-categories=performance,accessibility,best-practices,seo \
      --output=json --output-path="out/lighthouse/$form-$name.json" >/dev/null 2>&1 || echo "falló $form $p"
    node -e "const r=require('./out/lighthouse/$form-$name.json');const c=r.categories;console.log('$form'.padEnd(8),'$p'.padEnd(11),['performance','accessibility','best-practices','seo'].map(k=>k.slice(0,4)+' '+Math.round(c[k].score*100)).join('  '))"
  done
done
