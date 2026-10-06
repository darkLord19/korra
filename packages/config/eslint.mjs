import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** Shared flat config. Use: `export { default } from "@korra/config/eslint";` */
export default tseslint.config(
  { ignores: ["**/.next/**", "**/node_modules/**", "**/dist/**", "**/next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
);
