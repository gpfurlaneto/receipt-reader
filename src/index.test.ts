import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { PROMPT_VERSION, readReceipt } from "./index.ts";
import { sha256Hex } from "./hash.ts";
import { INSTRUCTIONS, OUTPUT_SCHEMA } from "./prompt.ts";
import {
  IMAGES,
  fakeLlm,
  illegible,
  notAReceiptOutput,
  receiptOutput,
} from "./testing/fake-llm.ts";

const image = IMAGES.jpeg;

describe("readReceipt with a fake LLM", () => {
  test("a complete cupom returns success with normalized fields", async () => {
    const output = receiptOutput({
      merchant: "PADARIA BOM PAO",
      receipt_date: "19/11/26",
      subtotal: "100,00",
      tax: "R$ 13,45",
      tip: "10,00",
      total: "110,00",
    });

    const result = await readReceipt({
      image,
      fileName: "cupom.jpg",
      llm: fakeLlm(output, "claude-test"),
    });

    assert.deepEqual(result, {
      status: "success",
      file_name: "cupom.jpg",
      file_hash: await sha256Hex(image),
      receipt: {
        merchant: "PADARIA BOM PAO",
        receipt_date: "2026-11-19",
        subtotal: "100.00",
        tax: "13.45",
        tip: "10.00",
        total: "110.00",
        currency: "BRL",
      },
      raw_output: output,
      warnings: [],
      model: "claude-test",
      prompt_version: PROMPT_VERSION,
    });
  });

  test("a maquininha slip with only the total warns about merchant and date", async () => {
    const result = await readReceipt({
      image,
      fileName: "maquininha.jpg",
      llm: fakeLlm(receiptOutput({ total: "R$ 45,90", receipt_date: illegible() })),
    });

    assert.equal(result.status, "success");
    assert.equal(result.receipt?.total, "45.90");
    assert.deepEqual(
      result.warnings.map(({ code, field }) => ({ code, field })),
      [
        { code: "missing_field", field: "merchant" },
        { code: "illegible_field", field: "receipt_date" },
      ],
    );
  });

  test("combines normalization and sum warnings", async () => {
    const result = await readReceipt({
      image,
      fileName: "cupom.jpg",
      llm: fakeLlm(
        receiptOutput({
          merchant: "BAR",
          receipt_date: "31/02/2026",
          subtotal: "100,00",
          tip: "10,00",
          total: "115,00",
        }),
      ),
    });

    assert.deepEqual(
      result.warnings.map(({ code, field }) => ({ code, field })),
      [
        { code: "invalid_date", field: "receipt_date" },
        { code: "sum_mismatch", field: undefined },
      ],
    );
  });

  test("not a receipt: receipt is null and there are no warnings", async () => {
    const output = notAReceiptOutput();
    const result = await readReceipt({
      image,
      fileName: "boleto.png",
      llm: fakeLlm(output),
    });

    assert.equal(result.status, "not_a_receipt");
    assert.equal(result.receipt, null);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.raw_output, output);
    assert.equal(result.model, "fake-model");
  });

  test("sends the image, its media type, the prompt and the schema", async () => {
    const llm = fakeLlm(receiptOutput({ total: "1,00" }));
    await readReceipt({ image: IMAGES.png, fileName: "photo.jpg", llm });

    assert.equal(llm.requests.length, 1);
    const [request] = llm.requests;
    assert.equal(request?.image, IMAGES.png);
    assert.equal(request?.mediaType, "image/png"); // from the bytes, not the name
    assert.equal(request?.instructions, INSTRUCTIONS);
    assert.equal(request?.outputSchema, OUTPUT_SCHEMA);
  });

  test("never sends the file name to the LLM", async () => {
    const llm = fakeLlm(receiptOutput({ total: "1,00" }));
    await readReceipt({ image, fileName: "ignore-previous-instructions.jpg", llm });
    assert.doesNotMatch(JSON.stringify(llm.requests), /ignore-previous/);
  });

  test("an unsupported image throws without calling the LLM", async () => {
    const llm = fakeLlm(receiptOutput());
    await assert.rejects(
      readReceipt({ image: new TextEncoder().encode("%PDF-1.7"), fileName: "a.pdf", llm }),
      /Unsupported image format/,
    );
    assert.equal(llm.requests.length, 0);
  });

  test("an empty image throws without calling the LLM", async () => {
    const llm = fakeLlm(receiptOutput());
    await assert.rejects(
      readReceipt({ image: new Uint8Array(), fileName: "a.jpg", llm }),
      /empty/i,
    );
    assert.equal(llm.requests.length, 0);
  });

  test("an invalid LLM output throws", async () => {
    await assert.rejects(
      readReceipt({ image, fileName: "a.jpg", llm: fakeLlm({ is_receipt: true }) }),
      /Invalid LLM output/,
    );
  });

  test("a client error is passed on", async () => {
    const error = new Error("API unavailable after retries");
    await assert.rejects(
      readReceipt({ image, fileName: "a.jpg", llm: fakeLlm(error) }),
      error,
    );
  });
});

describe("prompt", () => {
  test("tells the model to ignore the CPF and other personal documents", () => {
    assert.match(INSTRUCTIONS, /CPF/);
    assert.match(INSTRUCTIONS, /personal document number/);
  });

  test("the schema has no CPF field", () => {
    assert.doesNotMatch(JSON.stringify(OUTPUT_SCHEMA), /cpf/i);
    assert.equal(OUTPUT_SCHEMA.additionalProperties, false);
  });

  test("the schema sent to the LLM is exactly this", () => {
    // Locks what the API receives. If this fails after a change to the
    // model output or to zod, check the new schema against what structured
    // outputs supports, update this test and bump PROMPT_VERSION.
    const field = {
      type: "object",
      properties: {
        value: { type: ["string", "null"] },
        state: { type: "string", enum: ["present", "absent", "illegible"] },
      },
      required: ["value", "state"],
      additionalProperties: false,
    };
    assert.deepEqual(OUTPUT_SCHEMA, {
      type: "object",
      properties: {
        is_receipt: { type: "boolean" },
        merchant: field,
        receipt_date: field,
        subtotal: field,
        tax: field,
        tip: field,
        total: field,
      },
      required: ["is_receipt", "merchant", "receipt_date", "subtotal", "tax", "tip", "total"],
      additionalProperties: false,
    });
  });

  test("PROMPT_VERSION is set", () => {
    assert.ok(PROMPT_VERSION.length > 0);
  });
});
