/** Número con coma decimal y sin ceros de más ("70,5", "3"). */
export const fmtNumber = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 1 });
