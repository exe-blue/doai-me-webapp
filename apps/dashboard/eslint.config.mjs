import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Apply TypeScript rules only to TypeScript files
  {
    files: ["**/*.ts", "**/*.tsx"],
    ...nextTs[0],
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Ignore CommonJS files from linting
  globalIgnores([
    "server.js",
    "test-supabase.js",
  ]),
]);

export default eslintConfig;
