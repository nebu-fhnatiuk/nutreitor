import Link from "next/link";

/**
 * Barra superior de la capa pública de una org: un acceso discreto a "Ingresar"
 * para quien ya tiene cuenta (profesionales y deportistas). La página pública es
 * la vidriera para captar pacientes; sin esto, el login quedaba solo por URL.
 */
export function PublicTopBar() {
  return (
    <div className="mx-auto flex max-w-4xl justify-end px-6 pt-6">
      <Link
        href="/login"
        className="inline-flex h-10 items-center rounded-full border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        Ingresar
      </Link>
    </div>
  );
}
