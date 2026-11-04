// Picking a private key file in the "add server" form.
import assert from "node:assert/strict";
import { test } from "node:test";
import { setLocale } from "./i18n.js";
import { KEY_MAX_BYTES, keyedServerId, readKeyFile } from "./key-import.js";

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

test("only a server with an imported key sends its id", () => {
  assert.equal(keyedServerId({ id: "manual-3", hasKey: true }), "manual-3");
  assert.equal(keyedServerId({ id: "manual-4", hasKey: false }), null);
  assert.equal(keyedServerId({ id: "ts:n1", hasKey: false }), null);
});
