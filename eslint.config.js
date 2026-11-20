import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["dist/"] },

  js.configs.recommended,

  // Claude Code hook scripts run directly in Node.
  {
    files: [".claude/hooks/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly" },
    },
  },

  {
    files: ["src/**/*.ts"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true },
    },
  },

  // node:test functions return promises that the runner already tracks.
  {
    files: ["src/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          allowForKnownSafeCalls: [
            {
              from: "package",
              package: "node:test",
              name: ["test", "it", "describe", "suite"],
            },
          ],
        },
      ],
    },
  },

  // Printing lives only in the CLI. tsconfig.lib.json can't catch console,
  // because the DOM lib declares it.
  {
    files: ["src/**/*.ts"],
    ignores: ["src/cli.ts"],
    rules: { "no-console": "error" },
  },

  // Adapters are Node-only or provider-specific, so they are loaded with a
  // dynamic import() and never imported statically.
  {
    files: ["src/**/*.ts"],
    ignores: ["src/adapters/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/adapters/**"],
              message:
                "Load adapters with a dynamic import() from the CLI, never statically.",
            },
          ],
        },
      ],
    },
  },
);
