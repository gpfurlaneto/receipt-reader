import { sha256Hex } from "./hash.ts";
import { detectMediaType } from "./media-type.ts";
import { parseModelOutput } from "./model-output.ts";
import { normalizeReceipt } from "./normalize.ts";
import { INSTRUCTIONS, OUTPUT_SCHEMA, PROMPT_VERSION } from "./prompt.ts";
import type {
  ReadReceiptOptions,
  ReadReceiptResult,
  Receipt,
  ReceiptWarning,
} from "./types.ts";
import { computeWarnings } from "./warnings.ts";

export type * from "./types.ts";
export { PROMPT_VERSION } from "./prompt.ts";

/**
 * Library entry point. Must stay environment-agnostic (no fs, process or
 * console) so it can be used from Node, the CLI or a web project.
 * Stores nothing: it only returns the result.
 */
export async function readReceipt({
  image,
  fileName,
  llm,
}: ReadReceiptOptions): Promise<ReadReceiptResult> {
  const mediaType = detectMediaType(image);
  const fileHash = await sha256Hex(image);

  const response = await llm.extract({
    image,
    mediaType,
    instructions: INSTRUCTIONS,
    outputSchema: OUTPUT_SCHEMA,
  });
  const raw = parseModelOutput(response.output);

  if (!raw.is_receipt) {
    return result("not_a_receipt", null, []);
  }

  const { receipt, warnings } = normalizeReceipt(raw);
  return result("success", receipt, [
    ...warnings,
    ...computeWarnings(raw, receipt),
  ]);

  function result(
    status: ReadReceiptResult["status"],
    receipt: Receipt | null,
    warnings: ReceiptWarning[],
  ): ReadReceiptResult {
    return {
      status,
      file_name: fileName,
      file_hash: fileHash,
      receipt,
      raw_output: raw,
      warnings,
      model: response.model,
      prompt_version: PROMPT_VERSION,
    };
  }
}
