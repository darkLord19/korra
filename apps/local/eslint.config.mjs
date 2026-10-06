import base from "@korra/config/eslint";

// scripts/ are Node-only build helpers; public/ holds the copied (minified) pdf.js worker.
export default [{ ignores: ["scripts/**", "public/**"] }, ...base];
