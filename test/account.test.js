import test from "node:test"
import assert from "node:assert/strict"
import { isAccountEnabled, parseAccounts, serializeAccounts } from "../lib/account.js"

test("默认启用所有账号", () => {
  assert.equal(isAccountEnabled(undefined, "123"), true)
  assert.equal(isAccountEnabled({}, "123"), true)
  assert.equal(isAccountEnabled({ 123: false }, "123"), false)
  assert.equal(isAccountEnabled({ 123: true }, "123"), true)
})

test("解析 token 字符串并附加启用状态", () => {
  const list = parseAccounts(["uid1:cookie1", "uid2:cookie2"], { uid2: false })
  assert.deepEqual(list, [
    { uid: "uid1", cookie: "cookie1", enabled: true },
    { uid: "uid2", cookie: "cookie2", enabled: false },
  ])
})

test("解析对象形式的账号数据", () => {
  const list = parseAccounts([{ uid: "uid3", cookie: "c3", enabled: false }], {})
  assert.deepEqual(list, [{ uid: "uid3", cookie: "c3", enabled: false }])
})

test("序列化账号为 token 列表与停用映射", () => {
  const result = serializeAccounts([
    { uid: "uid1", cookie: "cookie1", enabled: true },
    { uid: "uid2", cookie: "cookie2", enabled: false },
    { uid: "", cookie: "orphan", enabled: true },
  ])
  assert.deepEqual(result.token, ["uid1:cookie1", "uid2:cookie2"])
  assert.deepEqual(result.accountEnabled, { uid2: false })
})

test("序列化与解析可往返还原", () => {
  const { token, accountEnabled } = serializeAccounts([
    { uid: "uid1", cookie: "cookie1", enabled: true },
    { uid: "uid2", cookie: "cookie2", enabled: false },
  ])
  const parsed = parseAccounts(token, accountEnabled)
  assert.deepEqual(parsed, [
    { uid: "uid1", cookie: "cookie1", enabled: true },
    { uid: "uid2", cookie: "cookie2", enabled: false },
  ])
})

test("cookie 含冒号时只按首个冒号切分", () => {
  const list = parseAccounts(["uid1:a=b:c"], {})
  assert.deepEqual(list, [{ uid: "uid1", cookie: "a=b:c", enabled: true }])
})
