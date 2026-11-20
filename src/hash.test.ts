import assert from "node:assert/strict";
import { test } from "node:test";

import { sha256Hex } from "./hash.ts";

test("SHA-256 of 'abc' in lowercase hex", async () => {
  assert.equal(
    await sha256Hex(new TextEncoder().encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("SHA-256 of empty input", async () => {
  assert.equal(
    await sha256Hex(new Uint8Array()),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

test("hashes only the view's bytes, not the whole buffer", async () => {
  const buffer = new TextEncoder().encode("xxabcxx");
  assert.equal(
    await sha256Hex(buffer.subarray(2, 5)),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
