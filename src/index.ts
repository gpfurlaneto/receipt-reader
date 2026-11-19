export interface ReadReceiptOptions {
  /** Original bytes of the receipt image. */
  image: Uint8Array;
  /** Original file name. */
  fileName: string;
}

export interface ReadReceiptResult {
  status: "success" | "not_a_receipt";
}

/**
 * Library entry point. Must stay environment-agnostic (no fs, process or
 * console) so it can be used from Node, the CLI or a web project.
 */
export function readReceipt(
  options: ReadReceiptOptions,
): Promise<ReadReceiptResult> {
  // TODO: hash -> extract -> normalize -> warnings -> return JSON.
  void options;
  return Promise.reject(new Error("Not implemented"));
}
