import type { z } from "zod";

import type { modelOutputSchema, rawFieldSchema } from "./model-output.ts";

// The model output types come from the zod schemas in src/model-output.ts,
// which document each field.

/** One field as the model read it: the printed text and its state. */
export type RawField = z.infer<typeof rawFieldSchema>;

/** Whether a field could be read from the receipt image. */
export type FieldState = RawField["state"];

/** What the LLM returns. Kept unchanged in `raw_output`. */
export type ReceiptModelOutput = z.infer<typeof modelOutputSchema>;

/** Fields read from the receipt, one per key of the model output. */
export type ReceiptFieldName = Exclude<keyof ReceiptModelOutput, "is_receipt">;

export type ImageMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif";

/** What the library sends to the LLM client. */
export interface ReceiptLlmRequest {
  image: Uint8Array;
  mediaType: ImageMediaType;
  /** Prompt owned by the library; see PROMPT_VERSION. */
  instructions: string;
  /** JSON Schema of ReceiptModelOutput. */
  outputSchema: Record<string, unknown>;
}

export interface ReceiptLlmResponse {
  /** JSON already parsed by the client. Validated by the library. */
  output: unknown;
  /** Model that actually answered (it may be a fallback model). */
  model: string;
}

/**
 * Small interface supplied by the caller. `extract` resolves only with a
 * final answer: retries and fallbacks happen inside the client, and it
 * rejects when it gives up.
 */
export interface ReceiptLlmClient {
  extract(request: ReceiptLlmRequest): Promise<ReceiptLlmResponse>;
}

export interface ReadReceiptOptions {
  /** Original bytes of the receipt image. Never modified. */
  image: Uint8Array;
  /** Original file name. Only copied to `file_name`; never sent to the LLM. */
  fileName: string;
  llm: ReceiptLlmClient;
}

/** Normalized receipt fields. Amounts are decimal strings, dates are ISO. */
export interface Receipt {
  merchant: string | null;
  /** ISO date, YYYY-MM-DD. */
  receipt_date: string | null;
  /** Decimal string with two places, e.g. "1234.56". */
  subtotal: string | null;
  tax: string | null;
  tip: string | null;
  total: string | null;
  currency: "BRL";
}

export type WarningCode =
  | "missing_field"
  | "illegible_field"
  | "invalid_date"
  | "invalid_amount"
  | "sum_mismatch";

export interface ReceiptWarning {
  code: WarningCode;
  field?: ReceiptFieldName;
  message: string;
}

export interface ReadReceiptResult {
  status: "success" | "not_a_receipt";
  file_name: string;
  /** SHA-256 of the image bytes, lowercase hex. */
  file_hash: string;
  /** Null when the image is not a receipt. */
  receipt: Receipt | null;
  raw_output: ReceiptModelOutput;
  warnings: ReceiptWarning[];
  model: string;
  prompt_version: string;
}
