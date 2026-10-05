import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "legacy/", "coverage/", ".runtime/"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: { allowDefaultProject: ["*.js"] }, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
      "no-console": "error",
    },
  },
  { files: ["src/core/logger/**", "scripts/**", "prisma/**"], rules: { "no-console": "off" } },
  // node:test registers tests by calling test(); the returned promise is awaited by the runner.
  {
    files: ["tests/**"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      // typed helpers like dataOf<T>() deliberately take a type argument used once
      "@typescript-eslint/no-unnecessary-type-parameters": "off",
      // assert.throws(() => fn()) is the idiomatic shape for expected failures
      "@typescript-eslint/no-confusing-void-expression": "off",
    },
  },
  { files: ["*.js"], ...tseslint.configs.disableTypeChecked },
  prettier,
);
