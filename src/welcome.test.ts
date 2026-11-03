import assert from "node:assert/strict";
import { test } from "node:test";
import { setLocale } from "./i18n.js";
import { t } from "./locales/welcome.js";
import { tailscaleHint } from "./welcome.js";

test("each Tailscale state has its own hint", () => {
  const states = ["ok", "needs_login", "not_running", "not_installed", "error"] as const;
  const hints = states.map((state) => tailscaleHint(state));
  assert.equal(new Set(hints).size, states.length);
  assert.match(tailscaleHint("needs_login")!, /not logged in/);
  assert.match(tailscaleHint("not_installed")!, /not found/);
  assert.equal(tailscaleHint("error", "timed out"), "Could not read Tailscale: timed out");
  assert.equal(tailscaleHint(null), null);
});

test("hints are in Chinese when the UI is", () => {
  setLocale("zh-CN");
  try {
    assert.match(tailscaleHint("needs_login")!, /登录/);
    assert.equal(tailscaleHint("error", "超时"), "读取 Tailscale 失败：超时");
  } finally {
    setLocale("en");
  }
});

test("the topology hint names the real config path", () => {
  assert.match(t("topologyHint", { path: "/cfg/starhop/topology.json" }), /\/cfg\/starhop\/topology\.json/);
});
