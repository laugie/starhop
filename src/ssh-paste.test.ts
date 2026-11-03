// Paste to add a server: an ssh command or user@host:port fills the form.
import assert from "node:assert/strict";
import { test } from "node:test";
import { setLocale } from "./i18n.js";
import { parseSshInput } from "./ssh-paste.js";

function ok(text: string) {
  const result = parseSshInput(text);
  if ("error" in result) {
    throw new Error(`${text}: ${result.error}`);
  }
  return result;
}

function err(text: string): string {
  const result = parseSshInput(text);
  if (!("error" in result)) {
    throw new Error(`${text} should be rejected`);
  }
  return result.error;
}

test("plain forms", () => {
  assert.deepEqual(ok("host-a"), { name: "host-a", host: "host-a", user: null, port: null });
  assert.deepEqual(ok("me@host-a"), { name: "host-a", host: "host-a", user: "me", port: null });
  assert.deepEqual(ok("me@192.0.2.5:2222"), { name: "192.0.2.5", host: "192.0.2.5", user: "me", port: 2222 });
  assert.deepEqual(ok("  host-a.example.com:22  "), {
    name: "host-a.example.com",
    host: "host-a.example.com",
    user: null,
    port: 22,
  });
  assert.deepEqual(ok("[2001:db8::1]:2200"), { name: "2001:db8::1", host: "2001:db8::1", user: null, port: 2200 });
  assert.deepEqual(ok("2001:db8::1"), { name: "2001:db8::1", host: "2001:db8::1", user: null, port: null });
});

test("ssh commands with -p and -l", () => {
  assert.deepEqual(ok("ssh me@host-a"), { name: "host-a", host: "host-a", user: "me", port: null });
  assert.deepEqual(ok("ssh -p 2222 me@host-a"), { name: "host-a", host: "host-a", user: "me", port: 2222 });
  assert.deepEqual(ok("ssh host-a -p2200 -l ops"), { name: "host-a", host: "host-a", user: "ops", port: 2200 });
  assert.deepEqual(ok("$ ssh -t me@host-a"), { name: "host-a", host: "host-a", user: "me", port: null });
});

test("ssh:// URLs", () => {
  assert.deepEqual(ok("ssh://me@host-a:2022"), { name: "host-a", host: "host-a", user: "me", port: 2022 });
  assert.deepEqual(ok("ssh://host-a/"), { name: "host-a", host: "host-a", user: null, port: null });
});

test("options the form cannot keep are refused with a hint", () => {
  assert.match(err("ssh -i ~/.ssh/key me@host-a"), /~\/\.ssh\/config/);
  assert.match(err("ssh -J jump me@host-a"), /~\/\.ssh\/config/);
  assert.match(err("ssh -o ProxyCommand=x host-a"), /~\/\.ssh\/config/);
  assert.match(err("ssh -L 8080:localhost:80 host-a"), /Option -L is not supported/);
});

test("bad input is refused", () => {
  assert.match(err(""), /Paste/);
  assert.match(err("ssh"), /Host/);
  assert.match(err("ssh host-a uptime"), /Remote command/);
  assert.match(err("ssh host-a; rm -rf ~"), /characters/);
  assert.match(err("me@host-a:99999"), /port/);
  assert.match(err("ssh -p abc host-a"), /port/);
  assert.match(err("-oProxyCommand=x"), /Host/);
  assert.match(err("me@"), /Host/);
});

test("errors are in Chinese when the language is Chinese", () => {
  setLocale("zh-CN");
  try {
    assert.equal(err(""), "粘贴一条 ssh 命令，或写成 用户@主机:端口");
    assert.equal(err("me@host-a:99999"), "端口必须是 1 到 65535 的数字");
    assert.equal(err("ssh -L 8080:localhost:80 host-a"), "不支持选项 -L");
    assert.equal(err("ssh -i ~/.ssh/key me@host-a"), "-i 需要写进 ~/.ssh/config，再用「从 ~/.ssh/config 导入」添加");
  } finally {
    setLocale("en");
  }
});
