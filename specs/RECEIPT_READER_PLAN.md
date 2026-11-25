# Plan: reading Brazilian receipts with an LLM

A study and implementation project to read images of Brazilian receipts, extract basic data with an LLM and return the result as JSON.

**Status:** Phases 0, 1 and 2 done. Phase 2 uses a synthetic dataset, not real receipts (see that phase's section). On 2026-11-19 the scope changed: the library no longer saves anything (no database, no images) and only returns the result. The focus changed too: the Brazilian market comes first, and the US market moves to the roadmap.

## Scope

**In scope:**
- Check whether the image is a receipt.
- Validated documents: **cupom não fiscal** (non-fiscal receipt) and **comprovante de maquininha** (card terminal slip).
- Extract merchant, date, subtotal, tax, tip and total, when they appear on the document.
- Return the result as JSON, with both raw and normalized values.
- Measure quality with evals and study industry practices.

**Out of scope:**
- Validating whether the receipt is genuine. The system transcribes what the image shows.
- Matching data against transactions, categorizing expenses or checking tax requirements.
- Extracting receipt line items, for now.
- Saving results or images. The caller decides whether and where to store them.
- Human review. It belongs to the system that consumes the result.
- Multi-company support, for now.
- Receipts from other countries, for now. The US market is on the roadmap.
- Extracting the consumer's CPF or other personal document numbers, such as RG and CNH. The model must ignore them (LGPD).

## Decisions

| Topic | Decision |
|---|---|
| Project | New `receipt-reader` repository, separate from this one |
| Format | Library that returns JSON, with a CLI that prints that JSON |
| Persistence | None. The library does not write to a database or save images |
| Stack | Node.js 24, TypeScript and ESM |
| LLM | Anthropic API, behind an interface |
| Approved dependencies | `@anthropic-ai/sdk`; `zod`; `eslint`, `@eslint/js` and `typescript-eslint` (dev) |
| Market | Brazil first. The contract is already generic (`currency`, ISO dates) so the US can be added later without changing the JSON |
| Documents | Validated: cupom não fiscal and comprovante de maquininha. NFC-e and CF-e SAT are also treated as receipts, but their quality is not measured |
| Fields | Every receipt field is nullable. A card terminal slip, for example, usually only has the total |
| Tax | Read only when it appears, such as the "Valor aproximado dos tributos" (Law 12.741). It is informational: in Brazil it is already included in the total |
| Tip | In Brazil, this is the service charge (usually 10%, optional) |
| CPF and personal documents | Never extracted. This covers the CPF and the consumer's other personal document numbers, such as RG and CNH |
| `success` | The image is a receipt and extraction ran, even if some field is missing |
| Missing key field | A missing merchant, date or total adds a warning to `warnings` |
| Hash | The file's SHA-256 is returned in the JSON so callers can deduplicate |
| Failures | Transient failures are handled inside the library. It only throws when it can't read the receipt |

### Reading principles

- **Missing field:** becomes `null`. The model must not compute or invent values.
- **Illegible field:** also becomes `null`, but with a state that distinguishes it from a missing field.
- **Sum that doesn't add up:** keep what is printed and record a warning, without correcting it. In Brazil the math is `subtotal + tip = total`, because tax is already included and is not added. A mismatch isn't always an error: a discount also makes the sum not add up.
- **Raw and normalized values:** both are returned in the JSON, the raw one in `raw_output` and the normalized one in `receipt`.

## Prerequisites

- **API key:** create it in the Claude Console, with its own credits. A Claude Code subscription does not cover API usage.
- **Spend limit:** set one in the Console, because evals consume credits.

## Phase 0: create the project

**Difference from `response-generator`:** it exports `./src/index.ts`, but Node does not strip types from files inside `node_modules`. To work as an installed library, the package must publish a build in `dist/`. In development, the `.ts` files still run directly.

### 1. Create the folder

```bash
cd /Users/furlaneto/git
mkdir -p receipt-reader/src && cd receipt-reader
git init
```

### 2. Create the files

**`.nvmrc`**

```text
24
```

**`.gitignore`**

```text
node_modules/
dist/
.env
data/
```

**`CLAUDE.md`**

```text
@AGENTS.md
```

**`package.json`**

```json
{
  "name": "receipt-reader",
  "version": "0.1.0",
  "description": "Reads receipt images and extracts basic data using an LLM, returning it as JSON.",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "bin": {
    "receipt-reader": "./dist/cli.js"
  },
  "files": [
    "dist"
  ],
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "start": "node --env-file-if-exists=.env src/cli.ts",
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc && tsc -p tsconfig.lib.json",
    "lint": "eslint .",
    "test": "node --test",
    "check": "npm run typecheck && npm run lint && npm test",
    "prepare": "git config core.hooksPath .githooks"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@types/node": "^24.0.0",
    "eslint": "^10.15.0",
    "typescript": "^5.9.0",
    "typescript-eslint": "^8.73.0"
  }
}
```

**`tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2024", "DOM"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**`tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "rewriteRelativeImportExtensions": true
  },
  "exclude": ["src/**/*.test.ts", "src/testing/**"]
}
```

**`tsconfig.lib.json`**

Checks the library without Node's types, so `process`, `Buffer` and `node:` imports are rejected. `console` still passes, because the DOM lib also declares it.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": []
  },
  "exclude": ["src/cli.ts", "src/adapters/**", "src/**/*.test.ts", "src/testing/**"]
}
```

**`eslint.config.js`**

Applies the recommended type-checked rules and covers what `tsconfig.lib.json` doesn't catch: `console` outside `src/cli.ts` and static imports of adapters.

```javascript
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
```

**`.env.example`**

```text
# Copy this file to .env and fill in the values. Never commit .env.
# Used only by the CLI and the eval runner. The library and the adapters receive
# values as arguments.

# Anthropic API key, created in the Claude Console.
ANTHROPIC_API_KEY=
```

**`.claude/settings.json`**

Blocks reading `.env` and defines two hooks. `PostToolUse` calls the `.claude/hooks/lint-edited-file.mjs` script, which runs ESLint only on the file Claude just edited, to flag errors right away. `Stop` runs `npm run -s check` (typecheck, lint and tests) on the whole project when Claude finishes a turn and, if it fails, makes Claude keep going until it is fixed. These guarantees apply only to Claude Code.

```json
{
  "permissions": {
    "deny": ["Read(./.env)"]
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/lint-edited-file.mjs\"",
            "statusMessage": "Linting edited file"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "cd \"$CLAUDE_PROJECT_DIR\" && npm run -s check 1>&2 || exit 2",
            "statusMessage": "Running checks (typecheck, lint, test)"
          }
        ]
      }
    ]
  }
}
```

**`.claude/hooks/lint-edited-file.mjs`**

Runs ESLint through its Node API on the edited file and shows only errors, at most 20 lines. Using Node instead of shell commands makes the hook behave the same on macOS, Linux and Windows.

```javascript
// PostToolUse hook: lints the file Claude just edited or created.
//
// Exit codes, as Claude Code reads them:
//   0 -> nothing to report; nothing is added to Claude's context.
//   2 -> stderr is sent back to Claude so it can fix the errors.
//
// It uses ESLint's Node API instead of a shell command, so it behaves the
// same on macOS, Linux and Windows.

import { ESLint } from "eslint";

const LINTED_EXTENSIONS = /\.(ts|js|mjs)$/;
const MAX_OUTPUT_LINES = 20; // keeps a bad edit from flooding Claude's context

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

const input = JSON.parse(await readStdin());
const file = input.tool_input?.file_path ?? "";

if (!LINTED_EXTENSIONS.test(file)) process.exit(0);

const eslint = new ESLint({ cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd() });
const results = await eslint.lintFiles([file]);
const errors = ESLint.getErrorResults(results); // errors only, like --quiet

if (errors.length === 0) process.exit(0);

const formatter = await eslint.loadFormatter("stylish");
const report = await formatter.format(errors);
const lines = report.trim().split("\n").slice(0, MAX_OUTPUT_LINES);

process.stderr.write(lines.join("\n") + "\n");
process.exit(2);
```

**`.githooks/pre-commit`**

Runs `npm run check` before each commit and cancels the commit if anything fails. It applies to any person or tool, not just Claude Code. The `prepare` script in `package.json` activates it on `npm install`. After creating the file, make it executable with `chmod +x .githooks/pre-commit`.

```sh
#!/bin/sh
# Runs every project check (typecheck, lint, test) before each commit.
# A non-zero exit cancels the commit.
# Activated by `npm install`, through the "prepare" script in package.json.

npm run -s check
```

**`.github/workflows/ci.yml`**

Runs `npm ci`, `npm run check` and `npm run build` on a clean GitHub machine on every push to `main` and on every pull request. It is the only check that can't be skipped. It uses no secrets: tests use a fake LLM, and evals against the real API don't run in CI.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

# Least privilege: the workflow can only read the repository.
permissions:
  contents: read

# A newer push to the same branch cancels the run still in progress.
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm run build
```

**`AGENTS.md`**

```markdown
# AGENTS.md

## Project
`receipt-reader` reads receipt images, checks that the image is a receipt, extracts basic
data with an LLM and returns the result as JSON. It does not verify authenticity; it
transcribes what the image shows. The code is generic; support grows by market: Brazil
first, then the US (see the plan).

**It is a library first, CLI second.** It stores nothing: no database and no image files.
Callers decide whether and where to save the result.

## Structure
- `src/index.ts`: public API: `readReceipt` and the contract types. No Node-only APIs.
- `src/types.ts`: the public contract (options, LLM client, result). A change here changes
  the JSON that callers receive.
- `src/model-output.ts`: zod schema of the model output, its single source. Its type, the
  JSON Schema sent to the LLM and the validation all come from it; never write them by hand.
- `src/prompt.ts`: prompt and output schema sent to the LLM. Bump `PROMPT_VERSION` on
  every change, so eval reports can tell versions apart.
- Other `src/*.ts` (except `src/cli.ts`): library steps. Same rule as `src/index.ts`.
- `src/cli.ts`: CLI entry point. Handles arguments, input files, printing and exit codes.
- `src/**/*.test.ts`: tests, next to the module they cover. They never call a real API;
  when they need a client, they use the fake LLM.
- `src/testing/`: test-only helpers (fake LLM client, output builders). Not published.
  Don't rename it to `test/`: `node --test` runs every file inside a `test/` folder.
- `src/adapters/` (created in Phase 4): Node-only or provider-specific code, imported
  dynamically by the CLI. The Claude adapter will also be exported as `receipt-reader/claude`.
- `specs/RECEIPT_READER_PLAN.md`: scope, decisions and phases. Read it before starting a phase.

## Setup
- Copy `.env.example` to `.env` to run the CLI or the eval runner. Only they read these
  variables; the library and the adapters receive values as arguments.
- `npm install` activates the git pre-commit hook in `.githooks/`, which runs `npm run check`.
  Never bypass it with `git commit --no-verify`.
- CI (`.github/workflows/ci.yml`) runs `npm run check` and `npm run build` on every push
  to `main` and on every pull request.

## Commands
- Run CLI: `npm start -- --file <image-path>`
- Type check: `npm run typecheck`
- Lint: `npm run lint`
- Test: `npm test`
- Build: `npm run build`
- All checks (typecheck, lint, test): `npm run check`. Run it before finishing any change.

## Conventions
- TypeScript, ESM, Node >= 24. Node runs `.ts` directly in development, so only use
  erasable syntax: no `enum`, `namespace` or constructor parameter properties.
- Published packages run from `dist/`, because Node does not strip types in `node_modules`.
- Library code must be environment-agnostic: no `fs`, `process`, `console` or other
  Node-only APIs. Inputs come in as arguments (e.g. image bytes, not a file path).
  `npm run typecheck` rejects Node-only APIs there, and `npm run lint` rejects `console`
  outside `src/cli.ts`.
- Argument parsing, reading files, printing and exit codes live only in `src/cli.ts`.
- Load adapters with a dynamic `import()`; `npm run lint` rejects static imports of them.
- The CLI writes results to stdout as JSON, errors to stderr, and exits non-zero on failure.
- Keep the LLM behind a small interface supplied by the caller.
- Never extract the consumer's CPF or other personal document numbers, such as RG or CNH
  (LGPD). The model must ignore them.
- Never hardcode API keys or connection strings.
- Receipt images, labels and per-receipt eval details stay in `data/` (gitignored); this repo
  is public. Only aggregated eval metrics go in `evals/results/`.
- Handle transient LLM failures inside the library (retries, refusal fallback). Throw only
  when the receipt can't be read; there is no `failed` status in the result.

## Dependencies
- Don't add dependencies without asking.
- Already approved in the plan:
  - `@anthropic-ai/sdk`
  - `zod` (validation and JSON Schema of the model output)
  - `eslint`, `@eslint/js` and `typescript-eslint` (dev)
```

**`src/index.ts`**

```typescript
export interface ReadReceiptOptions {
  /** Original bytes of the receipt image. */
  image: Uint8Array;
  /** Original file name. */
  fileName: string;
}

export interface ReadReceiptResult {
  status: "success" | "not_a_receipt";
}

/**
 * Library entry point. Must stay environment-agnostic (no fs, process or
 * console) so it can be used from Node, the CLI or a web project.
 */
export function readReceipt(
  options: ReadReceiptOptions,
): Promise<ReadReceiptResult> {
  // TODO: hash -> extract -> normalize -> warnings -> return JSON.
  void options;
  return Promise.reject(new Error("Not implemented"));
}
```

**`src/cli.ts`**

```typescript
#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";

import { readReceipt } from "./index.ts";

const { values } = parseArgs({
  options: { file: { type: "string" } },
});

if (!values.file) {
  console.error("Usage: receipt-reader --file <image-path>");
  process.exit(1);
}

try {
  const image = await readFile(values.file);
  const result = await readReceipt({
    image,
    fileName: basename(values.file),
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
```

### 3. Install and validate

```bash
npm install
npm run check              # typecheck, lint and tests
npm run build
npm start                  # should print usage and exit with code 1
npm pack --dry-run         # should list the contents of dist/
```

**Done when:** these commands behave as described and a test project can install the package and import `readReceipt`.

## Architecture

```text
CLI (src/cli.ts) or Node application
        ↓
readReceipt(image, llm)   ← no Node APIs
   └─ ReceiptLlmClient   → Claude adapter
        ↓
JSON with the result (nothing is saved)
```

### CLI and eval runner configuration

| Variable | Use |
|---|---|
| `ANTHROPIC_API_KEY` | API key |

This value lives in a `.env` outside Git, created from `.env.example`. Only the CLI and the eval runner read the variable, because they are the programs started from the terminal. They pass it to the adapter, which creates the client handed to the library. Neither the library nor the adapter reads the variable.

- **CLI:** exits with an error if the variable is not set, before processing any file.
- **Eval runner:** with the Claude adapter (Phase 4 onward), also exits with an error before processing any receipt. With the fake LLM (Phase 3), it doesn't need the variable.

### What the CLI does

The CLI is the bridge between the terminal and the library: it prepares the inputs, calls `readReceipt` and prints the result.

1. Reads the `--file` argument. If it's missing, prints usage and exits with code 1.
2. Checks `ANTHROPIC_API_KEY`. If it's missing, exits with code 1 before reading any file.
3. Reads the file and gets the image bytes.
4. Loads the Claude adapter with a dynamic `import()`.
5. Creates the client with the key and passes it as `llm`.
6. Calls `readReceipt({ image, fileName, llm })`.
7. Prints the JSON to stdout. On error, prints the reason to stderr and exits with code 1.

**Until Phase 4**, the adapter doesn't exist. The CLI really performs steps 1, 3, 6 and 7 and uses a placeholder client as `llm`, which always fails with "Claude adapter not available yet (Phase 4)". That way file reading, format checking and error output already work, and Phase 4 only swaps the placeholder client for steps 2, 4 and 5.

### Flow of an image

Each step and the type it produces. The types are in `src/types.ts` and detailed in Phase 1.

```text
 CLI / application
   │  ReadReceiptOptions { image, fileName, llm }
   ▼
 1. Detect the format from bytes ────► ImageMediaType         (empty or unsupported → throws, without calling the LLM)
 2. Compute SHA-256 (Web Crypto) ────► string (file_hash)
 3. Call the LLM once ───────────────► ReceiptLlmResponse { output: unknown, model }
      ReceiptLlmRequest { image, mediaType,   (retries and fallback inside the client, see Phase 4;
        instructions, outputSchema }            if it gives up → throws)
 4. Validate the LLM output ─────────► ReceiptModelOutput     (wrong shape → throws)
      │
      ├─ is_receipt = false ─────────► ReadReceiptResult { status: "not_a_receipt", receipt: null, warnings: [] }
      ▼
 5. Normalize amounts and dates ─────► Receipt + ReceiptWarning[]   (invalid_date, invalid_amount)
 6. Check fields and sum ────────────► ReceiptWarning[]             (missing_field, illegible_field, sum_mismatch)
 7. Build the result ────────────────► ReadReceiptResult { status: "success", ... }   (nothing is written)
```

### Status

| Status | Meaning |
|---|---|
| `success` | The image is a receipt and extraction ran, even if some field is missing |
| `not_a_receipt` | The image is not a receipt |

A technical error is not a status. The library throws an error with the reason when the image is not supported, when the LLM output is malformed, or when the client gives up after exhausting its attempts. The CLI prints the reason to stderr and exits with code 1.

## Phase 1: contract

The types live in `src/types.ts`, which is the source of truth. This section records the decisions behind them.

The shape of the model output is defined once, with zod, in `src/model-output.ts`. The TypeScript type, the JSON Schema sent to the LLM and the response validation all come from it, so the three can't drift apart. A test locks the generated JSON Schema, so a change to the schema or to zod can't silently alter what the API receives.

### LLM interface

```ts
interface ReceiptLlmClient {
  extract(request: ReceiptLlmRequest): Promise<ReceiptLlmResponse>;
}
interface ReceiptLlmRequest {
  image: Uint8Array;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  instructions: string;                  // the library's prompt
  outputSchema: Record<string, unknown>; // JSON Schema of the model output
}
interface ReceiptLlmResponse {
  output: unknown; // JSON already parsed by the client
  model: string;   // model that actually answered
}
```

- **The prompt and schema belong to the library** (`src/prompt.ts`). That's why `prompt_version` is a library constant, and switching providers doesn't change the prompt. The client only carries the image, instructions and schema. The `instructions` go in as the system prompt, and the user message carries only the image: separating trusted instructions from untrusted content helps against prompt injection.
- **`extract` only resolves with the final response.** Retries and fallbacks live inside the client. If it gives up, it rejects, and the library passes the error on.
- **`output` is `unknown`** because the library doesn't trust the LLM response and validates its shape before using it. If the returned text isn't JSON, the client is the one that throws.
- **`model` is the model that actually answered.** After a fallback, it may differ from the one requested. It goes straight to `result.model`.
- **`fileName` is never sent to the LLM.** It is only returned in `file_name`, to prevent injection or leaks through the file name.
- **The image format is detected from the bytes**, never from the extension. An empty image or unsupported format throws before calling the LLM.

### Model output (`raw_output`)

`is_receipt` and six fields (`merchant`, `receipt_date`, `subtotal`, `tax`, `tip`, `total`), each with `value` and `state`. `value` is the text as printed (`"1.234,56"`, `"19/11/26"`), not converted by the model.

| `state` | Meaning | `value` | In `receipt` |
|---|---|---|---|
| `present` | Printed and legible | Non-empty text | Normalized |
| `present` | — | `null` or empty | Invalid output: throws |
| `absent` | Not printed on the document | `null` | `null` |
| `illegible` | Printed, but illegible | `null` | `null` |
| `absent` or `illegible` | — | Has text | `null` (the text stays only in `raw_output`) |

- **No CPF field**, and extra keys are rejected (`additionalProperties: false` in the schema and in validation). The CPF has nowhere to appear.
- **The prompt tells the model to ignore the CPF and any other personal document number**, such as RG and CNH. The restriction is deliberately broader than the CPF, because of the LGPD. The merchant's CNPJ is not a personal document.
- **With `is_receipt: false`**, the six fields are still required (the prompt asks for `absent`). The library validates the shape but doesn't read them.

### Result

`status`, `file_name`, `file_hash` (SHA-256 in lowercase hex), `receipt` (`null` when it's not a receipt), `raw_output`, `warnings`, `model` and `prompt_version`.

- **`receipt` fields:** `merchant`, `receipt_date`, `subtotal`, `tax`, `tip`, `total` and `currency` (`BRL` for now).
- **Amounts** become a **decimal string** with two decimal places: `"1.234,56"` → `"1234.56"`. A string, not a number, to avoid floating-point errors for JSON consumers. Accepts `1.234,56`, `1234,56` and `R$ 12,50`; any other format becomes `null`.
- **Dates** in `DD/MM/YYYY` or `DD/MM/YY` (YY becomes 20YY, common on card terminals) become ISO (`YYYY-MM-DD`). Dates that don't exist, such as `31/02`, become `null`.
- **`not_a_receipt`:** `receipt` is `null`, `warnings` is empty and `raw_output` is kept.

### `warnings`

Each warning has `code`, `message` and, when it refers to a field, `field`.

| `code` | When |
|---|---|
| `missing_field` | Merchant, date or total with state `absent` |
| `illegible_field` | Merchant, date or total with state `illegible` |
| `invalid_date` | Date printed in a format that can't be read, or that doesn't exist (such as `31/02`) |
| `invalid_amount` | Amount printed in a format that can't be read |
| `sum_mismatch` | `subtotal + tip ≠ total`, when all three exist. Checked in cents; tax is not included |

An invalid field produces only `invalid_date` or `invalid_amount`, without a duplicate `missing_field`.

**Done when:** the `node:test` tests pass using a fake LLM, at no cost, and `npm run typecheck` is clean.

## Phase 2: reference dataset

**Done on 2026-11-25, with a synthetic dataset.** The images were generated by code (HTML rendered in Chrome, with simulated photo defects), not photographed. The labels come from the spec used to generate each image, so they don't depend on the model output. The decision was to accept the synthetic dataset so as not to block Phases 3 and 4. The risk is that the eval gives optimistic numbers, because rendered text is easier to read than real thermal paper and simulated defects don't always look like real ones.

| Item | Result |
|---|---|
| Location | `data/examples/images/` and `data/examples/labels.jsonl` (one line per image) |
| Volume | 100 images: 81 receipts and 19 non-receipts (19%) |
| Receipts | 36 cupons não fiscais, 37 card terminal slips, 5 NFC-e and 3 CF-e SAT |
| Non-receipts | Quote, order, boleto, bank statement, PIX, transfer, paid boleto and withdrawal receipts, and menu |
| Variety | 10 card terminals, 9 images with injection, 10 with service charge, discount, dark, blurry, rotated and crumpled photos, and faded paper |
| Split | 60 in `dev` and 40 in `test` |

Each line has `file`, `id`, `split`, `doc_type`, `tags`, `is_receipt` and `fields`. The six fields follow the Phase 1 states (`present`, `absent`, `illegible`), with `raw` and `value`.

**Open item:** 19 labels have dates with dots, hyphens or in ISO (`05.11.2025`, `21-06-2025`, `2025-11-08`) and a normalized `value`, but `parseBrDate` only accepts `DD/MM/YYYY` and `DD/MM/YY`. Extend the parser or change those values to `null` before Phase 3.

Original criteria:

- **Volume:** 50 to 100 real Brazilian receipts, split between cupons não fiscais and card terminal slips, and about 15 to 20% images that aren't receipts.
- **Variety:** several kinds of merchants and card terminals, bad photos, faded thermal paper, service charge, and 5 to 10 images with injection text. Include a few NFC-e to check that they are accepted as receipts.
- **Hard classification cases:** quote, order, boleto and bank statement.
- **Labels:** filled in without seeing the model output, in JSONL. Receipts with a CPF are labeled without it.
- **Split:** `dev` for tuning the prompt and `test` only for the final measurement.
- **Privacy:** images and labels stay in `data/`, outside Git, only on the laptop and in a private backup. The repository is public.

**Done when:** the dataset is labeled and split, covering the types above.

## Phase 3: eval runner

Scoring is deterministic, with no LLM as judge, and each report records the model and prompt versions.

| Metric | What it answers |
|---|---|
| `is_receipt` precision and recall | Does the gate work? |
| Per-field accuracy | Which field fails most? |
| Fully correct document | How many receipts won't need correction? |
| Hallucination | Does the model invent missing fields? |
| Accuracy by image type | Where does quality drop? |
| Injection resistance | Does text in the image change the output? |
| Cost and latency per document | Is the result worth it? |

Each run produces two separate outputs:

| Output | Content | Where it goes |
|---|---|---|
| **Summary** | Only aggregated metrics, model and prompt versions, cost and latency | `evals/results/`, committed, to keep a quality history |
| **Detail** | Per-receipt result: expected and read values, errors | `data/reports/`, outside Git, because it contains real receipt data |

**Done when:** the runner produces the full report using the fake LLM. This lets us validate it before spending on the API.

## Phase 4: Claude adapter and baseline

- **Dependency:** `@anthropic-ai/sdk`, in `dependencies`, because the published CLI needs it.
- **Shape:** `src/adapters/claude.ts` exports a function that creates the client. The adapter is the code; the client is the object it returns and that goes in `llm`.

  ```ts
  export function createClaudeClient(options: { apiKey: string }): ReceiptLlmClient
  ```

- **Key:** the adapter receives the key as an argument and never reads `process.env`. The caller decides where it comes from: the CLI and the eval runner read `ANTHROPIC_API_KEY`; another application uses whatever source it has.
- **Export:** the adapter is public, under the `receipt-reader/claude` entry of `exports` in `package.json`. That way an application reuses the retries and fallback instead of reimplementing them. The `"."` entry still doesn't depend on Anthropic: anyone who doesn't import `receipt-reader/claude` never loads the SDK. Since it becomes public API, changing the signature of `createClaudeClient` is a breaking change.
- **CLI:** replace the placeholder client with steps 2, 4 and 5 of "What the CLI does".
- **README:** create one for library users. It should show how to install, an example with `createClaudeClient` and `readReceipt`, a sample result, and how to implement your own `ReceiptLlmClient`.
- **Call:** official SDK with vision and `output_config.format`, no tools. `request.instructions` goes in the `system` parameter, and the user message contains only the image, no text. That way any text in the image that tries to give orders sits one level below our instructions.
- **Initial model:** `claude-opus-5-5`, with an explicit `effort`, because thinking can't be turned off on this model.
- **Refusal fallback:** enabled by default (`fallbacks: "default"`), returning `response.model` in `model`. It can be turned off.
- **Failures:** handled inside the adapter, in layers:
  1. The SDK retries transient errors on its own: 408, 409, 429, 5xx and connection failures, with 2 extra attempts by default (`maxRetries`).
  2. Refusals go through the model fallback.
  3. A response cut off by `max_tokens` is retried once with a higher limit.
  4. If none of that works, the adapter rejects with the reason, and the library passes the error on.
- **Security:** image content is treated as data, and the extractor has no tools or permissions.

**Done when:** there is a zero-shot baseline measured on `dev`. Accuracy targets will only be set after that.

## Phase 5: study experiments

Each experiment changes one variable, measured on `dev`:
1. **Zero-shot vs. few-shot:** how much do examples improve each field?
2. **Opus 5.5 vs. Sonnet 5.5 vs. Haiku 5.5:** which has the lowest cost per correct document?
3. **`effort` values:** at which level does quality stop improving?
4. **Resolution and preprocessing:** does downscaling, rotating or cropping the image help or hurt?
5. **Injection signal:** with a `contains_instructions` field in the schema, does the model flag the dataset images with injection text? Measure precision and recall. Only if the result is good does the field go into the contract, with its own warning (such as `suspicious_content`) so library users can send those receipts to review.

List prices per million input and output tokens, per the 2026-10-06 reference (confirm before using):

| Model | ID | Input | Output |
|---|---|---|---|
| Opus 5.5 | `claude-opus-5-5` | $4.00 | $20.00 |
| Sonnet 5.5 | `claude-sonnet-5-5` | $2.00 | $10.00 |
| Haiku 5.5 | `claude-haiku-5-5` | $0.10 | $0.50 |

The best configuration is measured once on `test`, with the Batch API, which costs 50% less.

**Done when:** there is a chosen configuration, justified with the `test` numbers.

## Phase 6: fine-tuning (optional)

Only worth it if a cost or accuracy problem remains. Current Claude models don't offer fine-tuning through the API, so the comparison would be a model tuned on Vertex AI, or an open model, against the best Phase 5 result.

- **Question:** does a cheap tuned model match the best few-shot result, at a lower total cost?
- **Data:** `raw_output` plus human corrections, if the system consuming the result stores both.
- **Caveat:** reviewers tend to accept the pre-filled value, so corrections may be biased. The result is still measured on the reference dataset.
- **Before starting:** confirm current availability in the provider's official documentation.

"Not worth it" is also a valid study result.

## Phase 7: ongoing operation

- **Regression:** run the evals on every prompt or model change.
- **Production:** if the system consuming the result stores `raw_output` and corrections, track the correction rate per field.
- **Dataset:** turn real errors into new test cases, after labeling them without seeing the model output.

## Roadmap: US market

Starts once Brazil has been measured on `test`. The JSON format doesn't change.

- **Documents:** store and restaurant receipts.
- **Rules:** amounts like `1,234.56` in `USD`, `MM/DD/YY` dates, and the sum becomes `subtotal + tax + tip = total`, because sales tax is added at the end.
- **Tip:** often handwritten.
- **Own dataset and evals:** 50 to 100 labeled US receipts, with the same process as Phase 2.

**Done when:** the US evals have a measured baseline, without worsening the Brazilian results.

## Risks

- **Prompt injection:** text in the image may try to change the output. The extractor has no tools, and resistance is measured in the evals.
- **Hash limitation:** it only identifies the same file. Anyone using the hash to deduplicate should know that two photos of the same receipt, or a recompressed image, produce different hashes.
- **Privacy (LGPD):** receipts may contain a CPF, names and last card digits. The library doesn't extract the CPF or other personal document numbers. The library stores nothing, but the dataset and the systems consuming the result do. Define who can access that data and how long it is kept, and consult legal before using real data.
- **Public benchmarks:** we haven't found a public labeled dataset of Brazilian receipts. The known datasets (such as SROIE and CORD) are from other countries, so results from other studies only serve as hypotheses.

## References

- [Vision vs. text parsing on invoices (arXiv 2509.04469)](https://arxiv.org/abs/2509.04469)
- [Prompt design on energy bills (arXiv 2604.25927)](https://arxiv.org/html/2604.25927)
- [Confidence in field extraction (arXiv 2606.24420)](https://arxiv.org/abs/2606.24420)
- [Evaluating extraction in production (Hyperscience)](https://www.hyperscience.ai/?p=14167)
- [Injection red team on document AI](https://prasannakumar018.github.io/Red-teaming/writeups/02_direct_prompt_injection)
- [Gemini supervised tuning (Vertex AI)](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini-supervised-tuning)
- [OpenAI deprecations, including fine-tuning](https://developers.openai.com/api/docs/deprecations)
