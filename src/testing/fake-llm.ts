// Test helpers: a fake LLM client and builders for model outputs.
// Not part of the published package (excluded from the build).

import type {
  RawField,
  ReceiptFieldName,
  ReceiptLlmClient,
  ReceiptLlmRequest,
  ReceiptModelOutput,
} from "../types.ts";

export interface FakeLlm extends ReceiptLlmClient {
  /** Every request the fake received, in order. */
  requests: ReceiptLlmRequest[];
}

/**
 * Fake client that always answers with `output`. Pass an Error to make it
 * reject instead.
 */
export function fakeLlm(output: unknown, model = "fake-model"): FakeLlm {
  const requests: ReceiptLlmRequest[] = [];
  return {
    requests,
    extract(request) {
      requests.push(request);
      if (output instanceof Error) return Promise.reject(output);
      return Promise.resolve({ output, model });
    },
  };
}

export const present = (value: string): RawField => ({
  value,
  state: "present",
});
export const absent = (): RawField => ({ value: null, state: "absent" });
export const illegible = (): RawField => ({ value: null, state: "illegible" });

/**
 * A receipt where every field is absent, overridden by `fields`.
 * Plain strings are shorthand for present fields.
 */
export function receiptOutput(
  fields: Partial<Record<ReceiptFieldName, RawField | string>> = {},
): ReceiptModelOutput {
  const field = (name: ReceiptFieldName): RawField => {
    const given = fields[name];
    if (given === undefined) return absent();
    return typeof given === "string" ? present(given) : given;
  };
  return {
    is_receipt: true,
    merchant: field("merchant"),
    receipt_date: field("receipt_date"),
    subtotal: field("subtotal"),
    tax: field("tax"),
    tip: field("tip"),
    total: field("total"),
  };
}

export function notAReceiptOutput(): ReceiptModelOutput {
  return { ...receiptOutput(), is_receipt: false };
}

/** Smallest valid header of each supported format, padded with zeros. */
export const IMAGES = {
  jpeg: bytes([0xff, 0xd8, 0xff, 0xe0]),
  png: bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  gif: bytes([...ascii("GIF89a")]),
  webp: bytes([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")]),
};

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

function bytes(header: number[]): Uint8Array {
  const image = new Uint8Array(32);
  image.set(header);
  return image;
}
