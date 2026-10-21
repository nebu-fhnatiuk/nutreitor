#!/usr/bin/env node
/**
 * Documentación viva (CLAUDE.md), en el CI: un PR que cambia el modelo de datos tiene
 * que actualizar `docs/architecture/data-model.md`, y un ADR nuevo tiene que sumarse a
 * la tabla del README. Sin IA: reglas fijas, baratas y sin falsos positivos.
 *
 *   node scripts/check-docs.mjs <base-ref>
 *
 * Escape: si el cambio de verdad no afecta la doc (p. ej. una migración que sólo
 * corrige un índice), poner `[sin-doc]` en la descripción del PR (variable PR_BODY).
 */
import { execFileSync } from "node:child_process";

const base = process.argv[2] ?? "origin/main";
const changed = execFileSync("git", ["diff", "--name-only", "--diff-filter=AMR", `${base}...HEAD`], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
const added = execFileSync("git", ["diff", "--name-only", "--diff-filter=A", `${base}...HEAD`], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

if ((process.env.PR_BODY ?? "").includes("[sin-doc]")) {
  console.log("[sin-doc] en la descripción del PR: chequeo de documentación omitido.");
  process.exit(0);
}

const touches = (p) => changed.includes(p);
const problems = [];

const migrations = changed.filter((f) => /^packages\/db\/migrations\/.+\.sql$/.test(f));
if (migrations.length > 0 && !touches("docs/architecture/data-model.md")) {
  problems.push(
    `Hay migraciones (${migrations.join(", ")}) pero no se actualizó docs/architecture/data-model.md (tabla, notas de RLS y erDiagram).`,
  );
}

const newAdrs = added.filter((f) => /^docs\/decisions\/\d{4}-.+\.md$/.test(f));
for (const adr of newAdrs) {
  const name = adr.replace("docs/decisions/", "");
  if (!touches("README.md")) {
    problems.push(`ADR nuevo (${name}) sin su fila en la tabla de decisiones del README.`);
  }
}

if (problems.length > 0) {
  console.error("Documentación viva — falta actualizar:\n");
  for (const p of problems) console.error(`  · ${p}`);
  console.error("\nSi el cambio no afecta la doc, agregá [sin-doc] a la descripción del PR y explicá por qué.");
  process.exit(1);
}
console.log(`Documentación viva: ok (${changed.length} archivos revisados).`);
