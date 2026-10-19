import type { TenantTx } from "@nutreitor/db";

import type { Rendered } from "../templates.js";

export type NotificationKind = "appointment_reminder" | "unread_message" | "adherence_reminder" | "report_published" | "contact_request";

/** Un aviso a generar. `refKey` + destinatario = idempotencia (UNIQUE en la base). */
export interface Candidate {
  kind: NotificationKind;
  refKey: string;
  recipientUserId: string | null;
  email: string;
  message: Rendered;
}

/** Contexto del consultorio que se está escaneando. */
export interface ScanContext {
  tx: TenantTx;
  now: Date;
  org: { slug: string; name: string };
  link: (path: string) => string;
}

export type Scan = (ctx: ScanContext) => Promise<Candidate[]>;
