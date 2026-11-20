import assert from "node:assert/strict";
import { test } from "node:test";

import { detectMediaType } from "./media-type.ts";
import { IMAGES } from "./testing/fake-llm.ts";

const cases = [
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
] as const;

for (const [name, mediaType] of cases) {
  test(`detects ${name}`, () => {
    assert.equal(detectMediaType(IMAGES[name]), mediaType);
  });
}

test("detects GIF87a", () => {
  const image = new Uint8Array(16);
  image.set([...new TextEncoder().encode("GIF87a")]);
  assert.equal(detectMediaType(image), "image/gif");
});

test("rejects an empty image", () => {
  assert.throws(() => detectMediaType(new Uint8Array()), /empty/i);
});

test("rejects an unsupported format", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7 ...");
  assert.throws(() => detectMediaType(pdf), /Unsupported image format/);
});

test("rejects a RIFF file that is not WEBP", () => {
  const wav = new TextEncoder().encode("RIFF\0\0\0\0WAVE");
  assert.throws(() => detectMediaType(wav), /Unsupported image format/);
});

test("rejects a truncated header", () => {
  assert.throws(() => detectMediaType(new Uint8Array([0x89, 0x50])), /Unsupported image format/);
});
