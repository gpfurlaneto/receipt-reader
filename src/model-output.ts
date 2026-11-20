import { z } from "zod";

/**
 * Single source of the model output's shape. The TypeScript types
 * (src/types.ts), the JSON Schema sent to the LLM (src/prompt.ts) and the
 * runtime validation below all come from these schemas.
 */

/**
 * One field as the model read it. `value` is the text exactly as printed
 * (e.g. "1.234,56" or "19/11/26"), never converted by the model.
 * - present: `value` is a non-empty string.
 * - absent: the field is not printed on the document; `value` is null.
 * - illegible: the field is printed but can't be read; `value` is null.
 */
export const rawFieldSchema = z
  .strictObject({
    value: z.string().nullable(),
    state: z.enum(["present", "absent", "illegible"]),
  })
  // Checked locally only: JSON Schema can't express it, so it is not sent.
  .refine((field) => field.state !== "present" || (field.value ?? "").trim() !== "", {
    message: "a present field must have a value",
  });

/** What the LLM returns. Kept unchanged in `raw_output`. */
export const modelOutputSchema = z.strictObject({
  is_receipt: z.boolean(),
  merchant: rawFieldSchema,
  receipt_date: rawFieldSchema,
  subtotal: rawFieldSchema,
  tax: rawFieldSchema,
  tip: rawFieldSchema,
  total: rawFieldSchema,
});

/** Checks that the LLM output has the expected shape, or throws. */
export function parseModelOutput(output: unknown): z.infer<typeof modelOutputSchema> {
  const result = modelOutputSchema.safeParse(output);
  if (!result.success) {
    throw new Error(`Invalid LLM output:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
