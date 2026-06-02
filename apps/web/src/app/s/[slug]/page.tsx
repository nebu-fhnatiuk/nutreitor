import { redirect } from "next/navigation";

import { fetchMe } from "@/lib/server/api";
import { roleHome } from "@nutreitor/shared";

/** Raíz del workspace: al dashboard del rol si hay sesión, sino al login. */
export default async function TenantRootPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const me = await fetchMe(slug);
  redirect(me ? roleHome[me.role] : "/login");
}
