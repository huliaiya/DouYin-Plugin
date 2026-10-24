import test from "node:test"
import assert from "node:assert/strict"
import { isLoginRiskError, loginRiskHint } from "../lib/login-error.js"

test("风控识别：扫码接口访问频繁错误", () => {
  assert.equal(isLoginRiskError("check_qrconnect error_code=7 访问太频繁，请稍后再试"), true)
  assert.equal(isLoginRiskError("check_qrconnect error_code=7"), true)
  assert.equal(isLoginRiskError("请求过于频繁，请稍后再试"), true)
})

test("风控识别：普通错误不误判", () => {
  assert.equal(isLoginRiskError("QR login timeout after 120000ms; last=new"), false)
  assert.equal(isLoginRiskError("账号密码错误"), false)
  assert.equal(isLoginRiskError("二次验证等待超时"), false)
  assert.equal(isLoginRiskError(""), false)
  assert.equal(isLoginRiskError(undefined), false)
})

test("风控提示语包含原因与处理建议", () => {
  const hint = loginRiskHint()
  assert.ok(hint.includes("风控"))
  assert.ok(hint.length > 10)
})
