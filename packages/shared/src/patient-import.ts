import { z } from "zod";

import type { PatientSex } from "./dtos/patient.dto.js";

/**
 * Import de deportistas desde un CSV (KAN-42/43/44, ADR 0043). Acá vive lo que no
 * necesita la base: leer el archivo, reconocer las columnas y validar cada fila.
 * Lo que sí la necesita (duplicados contra la organización, grupos, profesionales)
 * lo resuelve la API sobre este resultado.
 */

export const IMPORT_MAX_ROWS = 1000;
export const IMPORT_MAX_BYTES = 1_000_000;

export const importColumns = ["fullName", "email", "documentId", "birthDate", "sex", "phone", "groups", "professionalEmail"] as const;
export type ImportColumn = (typeof importColumns)[number];

/** Encabezado que ve la persona (y el de la plantilla). */
export const IMPORT_COLUMN_LABEL: Record<ImportColumn, string> = {
  fullName: "nombre",
  email: "email",
  documentId: "documento",
  birthDate: "fecha_nacimiento",
  sex: "sexo",
  phone: "telefono",
  groups: "grupo",
  professionalEmail: "profesional",
};

/** Encabezados aceptados, ya normalizados (minúsculas, sin tildes, `_`). */
const HEADER_ALIASES: Record<ImportColumn, string[]> = {
  fullName: ["nombre", "nombre_y_apellido", "nombre_completo", "apellido_y_nombre", "deportista", "socio", "socia"],
  email: ["email", "mail", "e_mail", "correo", "correo_electronico"],
  documentId: ["documento", "dni", "doc", "nro_documento", "numero_de_documento", "n_documento"],
  birthDate: ["fecha_nacimiento", "fecha_de_nacimiento", "nacimiento", "fecha_nac"],
  sex: ["sexo", "genero"],
  phone: ["telefono", "celular", "tel", "whatsapp"],
  groups: ["grupo", "grupos", "plantel", "division", "categoria"],
  professionalEmail: ["profesional", "nutricionista", "email_profesional", "profesional_email"],
};

/** Plantilla para bajar (separada por `;`, lo que abre bien Excel en es-AR). */
export const IMPORT_TEMPLATE =
  importColumns.map((c) => IMPORT_COLUMN_LABEL[c]).join(";") +
  "\nJuana Pérez;juana@mail.com;40123456;15/03/2007;F;+54 9 11 5555-0000;Primera femenina;\n";

export function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Nombre de grupo comparable: sin mayúsculas ni espacios de más (como el índice único). */
export const normalizeGroupName = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * CSV RFC 4180 con comillas, CRLF y BOM. El separador (`,` o `;`) se elige por el
 * que más aparece en la primera línea fuera de comillas.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  let semis = 0;
  let commas = 0;
  let quoted = false;
  for (const ch of firstLine) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === ";") semis++;
    else if (!quoted && ch === ",") commas++;
  }
  const sep = semis > commas ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export interface ImportRow {
  /** Línea del archivo (1 = encabezados), para que la persona la encuentre. */
  line: number;
  fullName: string;
  email: string | null;
  documentId: string | null;
  birthDate: string | null;
  sex: PatientSex | null;
  phone: string | null;
  groups: string[];
  professionalEmail: string | null;
  errors: string[];
}

export interface ParsedImport {
  rows: ImportRow[];
  /** Problemas del archivo entero (sin columna nombre, demasiadas filas…). */
  fileErrors: string[];
  /** Encabezados que no reconocimos (se ignoran). */
  ignoredHeaders: string[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SEX: Record<string, PatientSex> = {
  f: "female",
  femenino: "female",
  mujer: "female",
  m: "male",
  masculino: "male",
  varon: "male",
  hombre: "male",
  x: "other",
  otro: "other",
  no_binario: "other",
};

/** `AAAA-MM-DD` o `DD/MM/AAAA` (también con `-` o `.`) → ISO; null si no es una fecha real. */
export function parseImportDate(raw: string, today = new Date()): string | null {
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  const ar = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (ar) [d, m, y] = [Number(ar[1]), Number(ar[2]), Number(ar[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 1900 || date.getTime() > today.getTime()) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const clean = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

/** Lee y valida el archivo. No toca la base. */
export function parseImport(text: string, today = new Date()): ParsedImport {
  const fileErrors: string[] = [];
  // Caracteres, no bytes (shared no tiene TextEncoder): alcanza como tope.
  if (text.length > IMPORT_MAX_BYTES) {
    return { rows: [], fileErrors: ["El archivo pesa más de 1 MB."], ignoredHeaders: [] };
  }
  const table = parseCsv(text);
  const header = table[0];
  if (!header || header.every((h) => h.trim() === "")) {
    return { rows: [], fileErrors: ["El archivo está vacío."], ignoredHeaders: [] };
  }

  const index = new Map<ImportColumn, number>();
  const ignoredHeaders: string[] = [];
  header.forEach((h, i) => {
    const n = normalizeHeader(h);
    const col = importColumns.find((c) => HEADER_ALIASES[c].includes(n));
    if (col && !index.has(col)) index.set(col, i);
    else if (n) ignoredHeaders.push(h.trim());
  });
  if (!index.has("fullName")) {
    fileErrors.push('Falta la columna "nombre" (es la única obligatoria).');
    return { rows: [], fileErrors, ignoredHeaders };
  }

  const get = (cells: string[], c: ImportColumn) => {
    const i = index.get(c);
    return i === undefined ? null : clean(cells[i]);
  };

  const rows: ImportRow[] = [];
  table.slice(1).forEach((cells, i) => {
    if (cells.every((c) => c.trim() === "")) return;
    const errors: string[] = [];
    const fullName = get(cells, "fullName") ?? "";
    if (!fullName) errors.push("Falta el nombre.");
    else if (fullName.length > 200) errors.push("El nombre es demasiado largo.");

    const rawEmail = get(cells, "email");
    const email = rawEmail ? rawEmail.toLowerCase() : null;
    if (email && (!EMAIL.test(email) || email.length > 200)) errors.push(`Email inválido: "${rawEmail}".`);

    const documentId = get(cells, "documentId")?.replace(/[.\s]/g, "") ?? null;
    if (documentId && documentId.length > 60) errors.push("El documento es demasiado largo.");

    const rawDate = get(cells, "birthDate");
    const birthDate = rawDate ? parseImportDate(rawDate, today) : null;
    if (rawDate && !birthDate) errors.push(`Fecha de nacimiento inválida: "${rawDate}" (usá DD/MM/AAAA).`);

    const rawSex = get(cells, "sex");
    const sex = rawSex ? (SEX[normalizeHeader(rawSex)] ?? null) : null;
    if (rawSex && !sex) errors.push(`Sexo no reconocido: "${rawSex}" (usá F, M o X).`);

    const phone = get(cells, "phone");
    if (phone && phone.length > 40) errors.push("El teléfono es demasiado largo.");

    const groups = [
      ...new Map(
        (get(cells, "groups") ?? "")
          .split("|")
          .map((g) => g.trim().replace(/\s+/g, " "))
          .filter(Boolean)
          .map((g) => [normalizeGroupName(g), g] as const),
      ).values(),
    ];

    const rawPro = get(cells, "professionalEmail");
    const professionalEmail = rawPro ? rawPro.toLowerCase() : null;
    if (professionalEmail && !EMAIL.test(professionalEmail)) errors.push(`Email del profesional inválido: "${rawPro}".`);

    rows.push({ line: i + 2, fullName, email, documentId, birthDate, sex, phone, groups, professionalEmail, errors });
  });

  if (rows.length === 0) fileErrors.push("El archivo no tiene filas de datos.");
  if (rows.length > IMPORT_MAX_ROWS) {
    fileErrors.push(`El archivo tiene ${rows.length} filas; el máximo es ${IMPORT_MAX_ROWS}. Dividilo en partes.`);
  }

  // Duplicados dentro del archivo: se marca la segunda aparición y siguientes.
  const seen = { email: new Map<string, number>(), documentId: new Map<string, number>() };
  for (const r of rows) {
    for (const key of ["email", "documentId"] as const) {
      const v = r[key];
      if (!v) continue;
      const first = seen[key].get(v);
      if (first !== undefined) {
        r.errors.push(`${key === "email" ? "Email" : "Documento"} repetido en el archivo (línea ${first}).`);
      } else seen[key].set(v, r.line);
    }
  }

  return { rows, fileErrors, ignoredHeaders };
}

/** Lo que manda la pantalla: el texto del CSV y si se invita al portal. */
export const importPatientsSchema = z.object({
  csv: z.string().min(1, "El archivo está vacío.").max(IMPORT_MAX_BYTES * 2),
  invite: z.boolean().default(false),
});
export type ImportPatientsDto = z.infer<typeof importPatientsSchema>;

export interface ImportPreviewDto {
  rows: ImportRow[];
  fileErrors: string[];
  ignoredHeaders: string[];
  errorCount: number;
  /** Cuántas filas recibirían invitación (tienen email y se pidió invitar). */
  inviteCount: number;
  canImport: boolean;
}

export interface ImportResultDto {
  created: number;
  invited: number;
  assigned: number;
  grouped: number;
}
