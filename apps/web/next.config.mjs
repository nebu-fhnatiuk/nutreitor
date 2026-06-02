/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Imagen de prod autocontenida para Fargate (paridad dev/prod).
  output: "standalone",
  // Compila los tipos/DTOs compartidos directamente desde el workspace.
  transpilePackages: ["@nutreitor/shared"],
};

export default nextConfig;
