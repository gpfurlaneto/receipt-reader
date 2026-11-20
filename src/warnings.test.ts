import assert from "node:assert/strict";
import { test } from "node:test";

import type { Receipt, ReceiptModelOutput } from "./types.ts";
import { normalizeReceipt } from "./normalize.ts";
import { illegible, present, receiptOutput } from "./testing/fake-llm.ts";
import { computeWarnings } from "./warnings.ts";

const complete = {
  merchant: "PADARIA",
  receipt_date: "19/11/2026",
};

/** Normalizes `raw` and returns only the computed warnings' code and field. */
function warningsFor(raw: ReceiptModelOutput) {
  const { receipt }: { receipt: Receipt } = normalizeReceipt(raw);
  return computeWarnings(raw, receipt).map(({ code, field }) => ({ code, field }));
}

test("no warnings when the sum adds up", () => {
  const raw = receiptOutput({
    ...complete,
    subtotal: "100,00",
    tip: "10,00",
    total: "110,00",
  });
  assert.deepEqual(warningsFor(raw), []);
});

test("sum_mismatch when subtotal + tip differs from total", () => {
  const raw = receiptOutput({
    ...complete,
    subtotal: "100,00",
    tip: "10,00",
    total: "115,00",
  });
  assert.deepEqual(warningsFor(raw), [{ code: "sum_mismatch", field: undefined }]);
});

test("sum_mismatch on a discount too: the printed values are kept", () => {
  const raw = receiptOutput({
    ...complete,
    subtotal: "100,00",
    tip: "0,00",
    total: "90,00",
  });
  assert.deepEqual(warningsFor(raw), [{ code: "sum_mismatch", field: undefined }]);
});

test("tax is not part of the sum", () => {
  const raw = receiptOutput({
    ...complete,
    subtotal: "100,00",
    tax: "13,45",
    tip: "10,00",
    total: "110,00",
  });
  assert.deepEqual(warningsFor(raw), []);
});

test("compares in cents, without floating point errors", () => {
  const raw = receiptOutput({
    ...complete,
    subtotal: "0,10",
    tip: "0,20",
    total: "0,30",
  });
  assert.deepEqual(warningsFor(raw), []);
});

test("the sum is only checked when subtotal, tip and total exist", () => {
  const withoutTip = receiptOutput({ ...complete, subtotal: "100,00", total: "90,00" });
  const withoutSubtotal = receiptOutput({ ...complete, tip: "10,00", total: "90,00" });
  assert.deepEqual(warningsFor(withoutTip), []);
  assert.deepEqual(warningsFor(withoutSubtotal), []);
});

test("missing_field for absent merchant, date and total", () => {
  assert.deepEqual(warningsFor(receiptOutput()), [
    { code: "missing_field", field: "merchant" },
    { code: "missing_field", field: "receipt_date" },
    { code: "missing_field", field: "total" },
  ]);
});

test("illegible_field for illegible merchant, date and total", () => {
  const raw = receiptOutput({
    merchant: illegible(),
    receipt_date: illegible(),
    total: illegible(),
  });
  assert.deepEqual(warningsFor(raw), [
    { code: "illegible_field", field: "merchant" },
    { code: "illegible_field", field: "receipt_date" },
    { code: "illegible_field", field: "total" },
  ]);
});

test("no missing_field for absent subtotal, tax or tip", () => {
  const raw = receiptOutput({ ...complete, total: "50,00" });
  assert.deepEqual(warningsFor(raw), []);
});

test("an invalid date or total does not also count as missing", () => {
  const raw = receiptOutput({
    merchant: "PADARIA",
    receipt_date: present("31/02/2026"),
    total: present("abc"),
  });
  assert.deepEqual(warningsFor(raw), []);
});

test("every warning has a message", () => {
  const raw = receiptOutput({ subtotal: "1,00", tip: "1,00", total: "5,00" });
  const { receipt } = normalizeReceipt(raw);
  for (const warning of computeWarnings(raw, receipt)) {
    assert.ok(warning.message.length > 0);
  }
});
