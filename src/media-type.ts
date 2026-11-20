import type { ImageMediaType } from "./types.ts";

const SIGNATURES: { mediaType: ImageMediaType; matches: (b: Uint8Array) => boolean }[] = [
  { mediaType: "image/jpeg", matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  {
    mediaType: "image/png",
    matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    mediaType: "image/gif",
    matches: (b) => startsWith(b, ascii("GIF87a")) || startsWith(b, ascii("GIF89a")),
  },
  {
    mediaType: "image/webp",
    matches: (b) => startsWith(b, ascii("RIFF")) && startsWith(b.subarray(8), ascii("WEBP")),
  },
];

/**
 * Detects the image format from its first bytes (never from the file name).
 * Throws when the image is empty or the format is not supported.
 */
export function detectMediaType(image: Uint8Array): ImageMediaType {
  if (image.length === 0) throw new Error("The image is empty.");
  const signature = SIGNATURES.find(({ matches }) => matches(image));
  if (!signature) {
    throw new Error("Unsupported image format. Use JPEG, PNG, WEBP or GIF.");
  }
  return signature.mediaType;
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.length <= bytes.length && prefix.every((byte, i) => bytes[i] === byte);
}

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}
