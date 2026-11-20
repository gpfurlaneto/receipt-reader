#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";

import { readReceipt, type ReceiptLlmClient } from "./index.ts";

const USAGE = "Usage: receipt-reader --file <image-path>";

let file: string | undefined;
try {
  ({ file } = parseArgs({ options: { file: { type: "string" } } }).values);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(USAGE);
  process.exit(1);
}

if (!file) {
  console.error(USAGE);
  process.exit(1);
}

// Placeholder until Phase 4. It will be replaced by the Claude adapter,
// loaded with a dynamic import() and created with ANTHROPIC_API_KEY.
const llm: ReceiptLlmClient = {
  extract: () =>
    Promise.reject(new Error("Claude adapter not available yet (Phase 4).")),
};

try {
  const image = await readFile(file);
  const result = await readReceipt({
    image,
    fileName: basename(file),
    llm,
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
