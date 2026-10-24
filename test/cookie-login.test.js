import test from "node:test"
import assert from "node:assert/strict"
import { normalizeCookie, parseCookieInput, hasCookiePairs } from "../lib/cookie-login.js"

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

test("解析 Cookie-Editor 导出的 JSON 数组", () => {
  const json = JSON.stringify([
    { name: "sessionid", value: "abc" },
    { name: "ttwid", value: "def" },
  ])
  assert.equal(parseCookieInput(json), "sessionid=abc; ttwid=def")
})

test("解析 JSON 对象映射", () => {
  assert.equal(parseCookieInput('{"sessionid":"abc","ttwid":"def"}'), "sessionid=abc; ttwid=def")
})

test("普通 cookie 字符串原样归一化", () => {
  assert.equal(parseCookieInput("sessionid=abc;\n ttwid=def"), "sessionid=abc; ttwid=def")
})

test("浏览器复制格式：容忍无值标记、空段与键值周围空格", () => {
  assert.equal(parseCookieInput("enter_pc_once=1; douyin.com; x=2"), "enter_pc_once=1; douyin.com; x=2")
  assert.equal(parseCookieInput("a = 1 ; b = 2"), "a=1; b=2")
  assert.equal(parseCookieInput("a=1;;b=2;"), "a=1; b=2")
  assert.equal(parseCookieInput("token=abc=="), "token=abc==")
})

test("非法 JSON 回退为普通字符串处理", () => {
  assert.equal(parseCookieInput("[{name: sessionid"), "[{name: sessionid")
  assert.equal(parseCookieInput(""), "")
})
