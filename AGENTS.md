# AGENTS.md

## Project
`receipt-reader` reads images of US receipts, checks that the image is a receipt,
extracts basic data with an LLM and returns the result as JSON. It does not verify
authenticity; it transcribes what the image shows.

**It is a library first, CLI second.** It stores nothing: no database and no image files.
Callers decide whether and where to save the result.

## Structure
- `src/index.ts`: public API. No Node-only APIs.
- `src/cli.ts`: CLI entry point. Handles arguments, input files, printing and exit codes.
- `src/adapters/` (created with the first adapter): Node-only or provider-specific code,
  imported dynamically by the CLI.
- `specs/RECEIPT_READER_PLAN.md`: scope, decisions and phases. Read it before starting a phase.

## Setup
- Copy `.env.example` to `.env` to run the CLI. Only the CLI reads these variables.
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
- Never hardcode API keys or connection strings.
- Handle transient LLM failures inside the library (retries, refusal fallback). Throw only
  when the receipt can't be read; there is no `failed` status in the result.

## Dependencies
- Don't add dependencies without asking.
- Already approved in the plan:
  - `@anthropic-ai/sdk`
  - `eslint`, `@eslint/js` and `typescript-eslint` (dev)
