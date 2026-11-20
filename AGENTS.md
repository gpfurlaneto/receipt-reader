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
