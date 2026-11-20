import assert from "node:assert/strict";
import { test } from "node:test";

import { parseModelOutput } from "./model-output.ts";
import { notAReceiptOutput, receiptOutput } from "./testing/fake-llm.ts";

test("accepts a valid receipt output and returns it unchanged", () => {
  const output = receiptOutput({ merchant: "PADARIA", total: "10,00" });
  assert.deepEqual(parseModelOutput(structuredClone(output)), output);
});

test("accepts a not-a-receipt output", () => {
  const output = notAReceiptOutput();
  assert.deepEqual(parseModelOutput(output), output);
});

test("accepts a value sent with a non-present state", () => {
  const output = receiptOutput({ total: { value: "10,00", state: "illegible" } });
  assert.deepEqual(parseModelOutput(output), output);
});

const invalid: [string, unknown][] = [
  ["null", null],
  ["a string", "{}"],
  ["an array", []],
  ["missing is_receipt", { ...receiptOutput(), is_receipt: undefined }],
  ["is_receipt not boolean", { ...receiptOutput(), is_receipt: "true" }],
  ["missing a field", { ...receiptOutput(), total: undefined }],
  ["field not an object", { ...receiptOutput(), total: "10,00" }],
  ["unknown state", { ...receiptOutput(), total: { value: null, state: "unknown" } }],
  ["value not string or null", { ...receiptOutput(), total: { value: 10, state: "present" } }],
  ["present without value", { ...receiptOutput(), total: { value: null, state: "present" } }],
  ["present with empty value", { ...receiptOutput(), total: { value: "  ", state: "present" } }],
  ["extra key", { ...receiptOutput(), cpf: "123.456.789-00" }],
  ["extra key in a field", { ...receiptOutput(), total: { value: null, state: "absent", note: "x" } }],
];

for (const [name, output] of invalid) {
  test(`rejects ${name}`, () => {
    assert.throws(() => parseModelOutput(output), /Invalid LLM output/);
  });
}
