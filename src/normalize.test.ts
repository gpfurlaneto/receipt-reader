import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { normalizeReceipt, parseBrDate, parseBrlAmount } from "./normalize.ts";
import { absent, illegible, present, receiptOutput } from "./testing/fake-llm.ts";

describe("parseBrlAmount", () => {
  const valid: [string, string][] = [
    ["1.234,56", "1234.56"],
    ["1234,56", "1234.56"],
    ["R$ 12,50", "12.50"],
    ["R$12,50", "12.50"],
    [" 0,99 ", "0.99"],
    ["1.000.000,00", "1000000.00"],
  ];
  for (const [text, expected] of valid) {
    test(`"${text}" -> "${expected}"`, () => {
      assert.equal(parseBrlAmount(text), expected);
    });
  }

  for (const text of ["12.50", "1,2", "abc", "1.23,45", "", "R$", "-5,00"]) {
    test(`"${text}" is invalid`, () => {
      assert.equal(parseBrlAmount(text), null);
    });
  }
});

describe("parseBrDate", () => {
  const valid: [string, string][] = [
    ["19/11/2026", "2026-11-19"],
    ["19/11/26", "2026-11-19"],
    ["01/02/2024", "2024-02-01"],
    ["29/02/2024", "2024-02-29"],
  ];
  for (const [text, expected] of valid) {
    test(`"${text}" -> "${expected}"`, () => {
      assert.equal(parseBrDate(text), expected);
    });
  }

  for (const text of [
    "31/02/2026",
    "29/02/2026",
    "32/01/2026",
    "00/01/2026",
    "10/13/2026",
    "2026-11-19",
    "19/11/026",
    "1/1/2026",
    "",
  ]) {
    test(`"${text}" is invalid`, () => {
      assert.equal(parseBrDate(text), null);
    });
  }
});

describe("normalizeReceipt", () => {
  test("normalizes every present field", () => {
    const { receipt, warnings } = normalizeReceipt(
      receiptOutput({
        merchant: "  PADARIA BOM PAO  ",
        receipt_date: "19/11/26",
        subtotal: "100,00",
        tax: "R$ 13,45",
        tip: "10,00",
        total: "110,00",
      }),
    );
    assert.deepEqual(receipt, {
      merchant: "PADARIA BOM PAO",
      receipt_date: "2026-11-19",
      subtotal: "100.00",
      tax: "13.45",
      tip: "10.00",
      total: "110.00",
      currency: "BRL",
    });
    assert.deepEqual(warnings, []);
  });

  test("absent and illegible fields become null", () => {
    const { receipt, warnings } = normalizeReceipt(
      receiptOutput({ merchant: illegible(), total: "50,00" }),
    );
    assert.equal(receipt.merchant, null);
    assert.equal(receipt.receipt_date, null);
    assert.equal(receipt.total, "50.00");
    assert.deepEqual(warnings, []);
  });

  test("ignores a value sent with a non-present state", () => {
    const { receipt } = normalizeReceipt(
      receiptOutput({ total: { value: "50,00", state: "illegible" } }),
    );
    assert.equal(receipt.total, null);
  });

  test("an invalid date becomes null with a warning", () => {
    const { receipt, warnings } = normalizeReceipt(
      receiptOutput({ receipt_date: present("31/02/2026") }),
    );
    assert.equal(receipt.receipt_date, null);
    assert.deepEqual(
      warnings.map(({ code, field }) => ({ code, field })),
      [{ code: "invalid_date", field: "receipt_date" }],
    );
  });

  test("an invalid amount becomes null with a warning", () => {
    const { receipt, warnings } = normalizeReceipt(
      receiptOutput({ tip: present("10%"), total: absent() }),
    );
    assert.equal(receipt.tip, null);
    assert.deepEqual(
      warnings.map(({ code, field }) => ({ code, field })),
      [{ code: "invalid_amount", field: "tip" }],
    );
  });
});
