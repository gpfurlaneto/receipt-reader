/** SHA-256 of the bytes, as lowercase hex. Uses Web Crypto. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Copy into a fresh ArrayBuffer: hashes only this view's bytes, and
  // works even when `bytes` is a view over a larger or shared buffer.
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
