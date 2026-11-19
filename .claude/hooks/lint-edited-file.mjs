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
