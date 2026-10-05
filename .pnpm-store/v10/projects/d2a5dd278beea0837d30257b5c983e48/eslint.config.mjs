import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ["frontend/components/**/*.{ts,tsx}", "frontend/hooks/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/api/**", "@/lib/mocks/**", "@/lib/server/**"],
              message:
                "Pages own reads; pass resolved props and action references.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message: "Reads belong in lib/api and are orchestrated by pages.",
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    ".next-*/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
]);
