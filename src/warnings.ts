import type {
  Receipt,
  ReceiptFieldName,
  ReceiptModelOutput,
  ReceiptWarning,
} from "./types.ts";

const IMPORTANT_FIELDS = ["merchant", "receipt_date", "total"] as const;

/**
 * Warnings for missing or illegible important fields (merchant, date, total)
 * and for subtotal + tip != total. Fields that were present but invalid
 * already have their own warning from normalizeReceipt.
 */
export function computeWarnings(
  raw: ReceiptModelOutput,
  receipt: Receipt,
): ReceiptWarning[] {
  const warnings: ReceiptWarning[] = [];

  for (const field of IMPORTANT_FIELDS) {
    const { state } = raw[field];
    if (receipt[field] !== null || state === "present") continue;
    warnings.push(
      state === "illegible"
        ? { code: "illegible_field", field, message: `${label(field)} is illegible.` }
        : { code: "missing_field", field, message: `${label(field)} is missing.` },
    );
  }

  const { subtotal, tip, total } = receipt;
  if (subtotal !== null && tip !== null && total !== null) {
    const sum = cents(subtotal) + cents(tip);
    if (sum !== cents(total)) {
      warnings.push({
        code: "sum_mismatch",
        message: `subtotal + tip (${fromCents(sum)}) differs from total (${total}).`,
      });
    }
  }

  return warnings;
}

function label(field: ReceiptFieldName): string {
  return field === "receipt_date" ? "The date" : `The ${field}`;
}

/** "1234.56" -> 123456. Amounts are normalized, so the format is known. */
function cents(amount: string): number {
  return Number(amount.replace(".", ""));
}

function fromCents(value: number): string {
  return `${Math.trunc(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}
