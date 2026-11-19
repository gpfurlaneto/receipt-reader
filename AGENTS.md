# AGENTS.md

## Project
`receipt-reader` reads images of US receipts, checks that the image is a receipt,
extracts basic data with an LLM and stores the result. It does not verify authenticity;
it transcribes what the image shows. Humans review results in a separate system.

**It is a library first, CLI second.**

## Structure
- `src/index.ts`: public API. No Node-only APIs.
- `src/cli.ts`: CLI entry point. Handles arguments, input files, printing and exit codes.
- `src/adapters/` (created with the first adapter): Node-only or provider-specific code,
  imported dynamically by the CLI.
- `specs/RECEIPT_READER_PLAN.md`: scope, decisions and phases. Read it before starting a phase.

## Setup
- Copy `.env.example` to `.env` to run the CLI. Only the CLI reads these variables.

## Commands
- Run CLI: `npm start -- --file <image-path>`
- Type check: `npm run typecheck`
- Test: `npm test`
- Build: `npm run build`

## Conventions
- TypeScript, ESM, Node >= 24. Node runs `.ts` directly in development, so only use
  erasable syntax: no `enum`, `namespace` or constructor parameter properties.
- Published packages run from `dist/`, because Node does not strip types in `node_modules`.
- Library code must be environment-agnostic: no `fs`, `process`, `console` or other
  Node-only APIs. Inputs come in as arguments (e.g. image bytes, not a file path).
  `npm run typecheck` rejects Node-only APIs there, but not `console`, which the DOM lib declares.
- Argument parsing, reading files, printing and exit codes live only in `src/cli.ts`.
- The CLI writes results to stdout as JSON, errors to stderr, and exits non-zero on failure.
- Keep the LLM, database and image storage behind small interfaces supplied by the caller.
- Never hardcode API keys or connection strings.
- `raw_output` is immutable after it is written.

## Dependencies
- Don't add dependencies without asking.
- Already approved in the plan:
  - `@anthropic-ai/sdk`
  - `pg`
  - `@types/pg` (dev)
