import test from "node:test"
import assert from "node:assert/strict"
import { normalizeCookie, hasCookiePairs } from "../lib/cookie-login.js"

test("归一化 cookie：换行与多余空白折叠为单空格", () => {
  assert.equal(normalizeCookie("a=1;\n  b=2;\r\n c=3"), "a=1; b=2; c=3")
  assert.equal(normalizeCookie("  a=1  "), "a=1")
  assert.equal(normalizeCookie(undefined), "")
})

test("识别 cookie 键值对", () => {
  assert.equal(hasCookiePairs("sessionid=abc; ttwid=def"), true)
  assert.equal(hasCookiePairs("sessionid=abc"), false)
  assert.equal(hasCookiePairs("abc; def"), false)
  assert.equal(hasCookiePairs(""), false)
})
