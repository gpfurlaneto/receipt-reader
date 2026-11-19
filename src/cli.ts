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
