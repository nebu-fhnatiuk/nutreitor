import tseslint from "typescript-eslint";

/**
 * Config ESLint del monorepo (flat config). Arranca liviana: parsea TS y marca
 * unused/any como WARN para no bloquear el CI por estilo en esta etapa — el peso
 * de calidad lo llevan typecheck + tests. Se puede endurecer (recommended /
 * type-checked) más adelante.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/.astro/**",
      "**/*.config.*",
      "**/*.cjs",
      "**/migrations/**",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
