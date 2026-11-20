import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";

const CLI = join(import.meta.dirname, "cli.ts");
const dir = mkdtempSync(join(tmpdir(), "receipt-reader-cli-"));
after(() => rmSync(dir, { recursive: true, force: true }));

function run(...args: string[]) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH },
  });
  return { status, stdout, stderr };
}

function file(name: string, bytes: Uint8Array): string {
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return path;
}

describe("CLI", () => {
  test("without --file, prints the usage and exits 1", () => {
    const { status, stdout, stderr } = run();
    assert.equal(status, 1);
    assert.equal(stdout, "");
    assert.match(stderr, /^Usage: receipt-reader --file <image-path>/);
  });

  test("an unknown option prints the reason and the usage, without a stack trace", () => {
    const { status, stderr } = run("--arquivo", "x.jpg");
    assert.equal(status, 1);
    assert.match(stderr, /Unknown option '--arquivo'/);
    assert.match(stderr, /Usage: receipt-reader --file <image-path>/);
    assert.doesNotMatch(stderr, /\n\s+at /);
  });

  test("a missing file prints the reason and exits 1", () => {
    const { status, stderr } = run("--file", join(dir, "nao-existe.jpg"));
    assert.equal(status, 1);
    assert.match(stderr, /ENOENT/);
  });

  test("an unsupported format is rejected before the LLM step", () => {
    const pdf = file("doc.pdf", new TextEncoder().encode("%PDF-1.7"));
    const { status, stderr } = run("--file", pdf);
    assert.equal(status, 1);
    assert.match(stderr, /Unsupported image format/);
  });

  test("a valid image reaches the placeholder client until Phase 4", () => {
    const jpeg = file("cupom.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]));
    const { status, stdout, stderr } = run("--file", jpeg);
    assert.equal(status, 1);
    assert.equal(stdout, "");
    assert.match(stderr, /Claude adapter not available yet \(Phase 4\)/);
  });
});
