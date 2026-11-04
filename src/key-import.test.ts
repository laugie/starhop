// Picking a private key file in the "add server" form.
import assert from "node:assert/strict";
import { test } from "node:test";
import { setLocale } from "./i18n.js";
import { KEY_MAX_BYTES, readKeyFile } from "./key-import.js";
import { sshTargetOf } from "./session.js";
import type { HostEntry } from "./hosts.js";

function fakeFile(size: number, text: string): Pick<File, "size" | "text"> {
  return { size, text: async () => text };
}

test("a key file is read as text", async () => {
  assert.equal(await readKeyFile(fakeFile(12, "key text")), "key text");
  assert.equal(await readKeyFile(fakeFile(KEY_MAX_BYTES, "at the limit")), "at the limit");
});

test("a file over the limit is refused without reading it", async () => {
  const file: Pick<File, "size" | "text"> = {
    size: KEY_MAX_BYTES + 1,
    text: () => {
      throw new Error("should not be read");
    },
  };
  await assert.rejects(readKeyFile(file), /larger than 64 KB/);
  setLocale("zh-CN");
  try {
    await assert.rejects(readKeyFile(file), /超过 64 KB/);
  } finally {
    setLocale("en");
  }
});

function entry(over: Partial<HostEntry>): HostEntry {
  return {
    id: "manual-3",
    name: "aws",
    host: "203.0.113.9",
    ip: "203.0.113.9",
    online: null,
    os: null,
    user: "ec2-user",
    port: null,
    source: "manual",
    connectTarget: "203.0.113.9",
    hasKey: false,
    ...over,
  };
}

test("only a server with an imported key sends its id, and never a path", () => {
  assert.deepEqual(sshTargetOf(entry({ hasKey: true })), {
    host: "203.0.113.9",
    user: "ec2-user",
    port: null,
    manualId: "manual-3",
  });
  assert.equal(sshTargetOf(entry({})).manualId, null);
  assert.equal(
    sshTargetOf(entry({ id: "ts:n1", source: "tailscale", user: null })).manualId,
    null,
  );
});
