import type {
  Receipt,
  ReceiptFieldName,
  ReceiptModelOutput,
  ReceiptWarning,
} from "./types.ts";

// "1.234,56", "1234,56" or "12,50": thousands with dots, two decimals.
const BRL_AMOUNT = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})$/;
const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/;

/** "1.234,56" or "R$ 12,50" -> "1234.56" / "12.50". Null when invalid. */
export function parseBrlAmount(text: string): string | null {
  const match = BRL_AMOUNT.exec(text.replace(/^\s*R\$/, "").trim());
  if (!match) return null;
  const [, integer = "", cents = ""] = match;
  const units = integer.replaceAll(".", "").replace(/^0+(?=\d)/, "");
  return `${units}.${cents}`;
}

/** "19/11/2026" or "19/11/26" -> "2026-11-19". Null when invalid. */
export function parseBrDate(text: string): string | null {
  const match = BR_DATE.exec(text.trim());
  if (!match) return null;
  const [, dd = "", mm = "", yy = ""] = match;
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  const month = Number(mm);
  const day = Number(dd);
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return valid ? `${String(year).padStart(4, "0")}-${mm}-${dd}` : null;
}

const AMOUNT_FIELDS = ["subtotal", "tax", "tip", "total"] as const;

/**
 * Converts the model output into normalized fields. Values that can't be
 * parsed become null with an invalid_date or invalid_amount warning.
 */
export function normalizeReceipt(raw: ReceiptModelOutput): {
  receipt: Receipt;
  warnings: ReceiptWarning[];
} {
  const warnings: ReceiptWarning[] = [];
  const text = (name: ReceiptFieldName): string | null => {
    const field = raw[name];
    return field.state === "present" ? (field.value?.trim() ?? null) : null;
  };
  const parse = (
    name: ReceiptFieldName,
    parser: (text: string) => string | null,
    code: "invalid_date" | "invalid_amount",
  ): string | null => {
    const printed = text(name);
    if (printed === null) return null;
    const parsed = parser(printed);
    if (parsed === null) {
      warnings.push({ code, field: name, message: `Could not read ${name} "${printed}".` });
    }
    return parsed;
  };

  const receiptDate = parse("receipt_date", parseBrDate, "invalid_date");
  const [subtotal, tax, tip, total] = AMOUNT_FIELDS.map((name) =>
    parse(name, parseBrlAmount, "invalid_amount"),
  );

  return {
    receipt: {
      merchant: text("merchant") || null,
      receipt_date: receiptDate,
      subtotal: subtotal ?? null,
      tax: tax ?? null,
      tip: tip ?? null,
      total: total ?? null,
      currency: "BRL",
    },
    warnings,
  };
}
