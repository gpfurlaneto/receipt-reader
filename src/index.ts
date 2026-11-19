export interface ReadReceiptOptions {
  /** Original bytes of the receipt image. */
  image: Uint8Array;
  /** Original file name. */
  fileName: string;
}

export interface ReadReceiptResult {
  status: "success" | "not_a_receipt" | "failed" | "ignored";
}

/**
 * Library entry point. Must stay environment-agnostic (no fs, process or
 * console) so it can be used from Node, the CLI or a web project.
 */
export async function readReceipt(
  options: ReadReceiptOptions,
): Promise<ReadReceiptResult> {
  // TODO: hash -> reserve -> store image -> extract -> normalize -> save.
  void options;
  throw new Error("Not implemented");
}
