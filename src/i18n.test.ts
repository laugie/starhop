import assert from "node:assert/strict";
import { test } from "node:test";
import { defineMessages, fill, locale, resolveLocale, setLocale } from "./i18n.js";

test("auto follows the system language; any zh tag is Chinese", () => {
  assert.equal(resolveLocale("auto", "zh-CN"), "zh-CN");
  assert.equal(resolveLocale(null, "zh-Hant-TW"), "zh-CN");
  assert.equal(resolveLocale(undefined, "en-GB"), "en");
  assert.equal(resolveLocale("auto", "de"), "en");
  assert.equal(resolveLocale("auto", ""), "en");
  assert.equal(resolveLocale("en", "zh-CN"), "en");
  assert.equal(resolveLocale("zh-CN", "en-US"), "zh-CN");
  assert.equal(resolveLocale("fr", "zh-CN"), "zh-CN", "unknown setting is auto");
});

test("templates fill named parameters", () => {
  assert.equal(fill("Hi {name}, {n} new", { name: "Ada", n: 3 }), "Hi Ada, 3 new");
  assert.equal(fill("Keep {missing}", { name: "x" }), "Keep {missing}");
  assert.equal(fill("No params"), "No params");
});

test("messages switch with the locale; functions handle plurals", () => {
  const t = defineMessages(
    { hello: "Hello {name}", tabs: (p: { n: number }) => (p.n === 1 ? "1 tab" : `${p.n} tabs`) },
    { hello: "你好 {name}", tabs: (p: { n: number }) => `${p.n} 个标签` },
  );
  const before = locale();
  try {
    setLocale("en");
    assert.equal(t("hello", { name: "Ada" }), "Hello Ada");
    assert.equal(t("tabs", { n: 1 }), "1 tab");
    assert.equal(t("tabs", { n: 2 }), "2 tabs");
    setLocale("zh-CN");
    assert.equal(t("hello", { name: "Ada" }), "你好 Ada");
    assert.equal(t("tabs", { n: 2 }), "2 个标签");
  } finally {
    setLocale(before);
  }
});

test("the default locale is English", () => {
  assert.equal(locale(), "en");
});
