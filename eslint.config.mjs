import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-*/**",
    "out/**",
    ".pages/**",
    "build/**",
    "next-env.d.ts",
    // Not part of the Next.js app.
    "ml/**",
    "public/**",
    "supabase/**",
  ]),
]);

export default eslintConfig;
