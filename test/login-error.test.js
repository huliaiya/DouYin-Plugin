import test from "node:test"
import assert from "node:assert/strict"
import { isLoginRiskError, isSessionLostError, loginRiskHint, sessionLostHint } from "../lib/login-error.js"

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

test("登录态失效识别：会话长度异常与上传凭据不可用", () => {
  assert.equal(isSessionLostError("发送被拒：statusCode=1 unexepcted session length"), true)
  assert.equal(isSessionLostError("IM proto response decode failed cmd=100 /v1/message/send"), true)
  assert.equal(isSessionLostError("upload credentials unavailable (HTTP 200)"), true)
  assert.equal(isSessionLostError("网络超时"), false)
  assert.equal(isSessionLostError(""), false)
})

test("登录态失效提示语包含处理方式", () => {
  const hint = sessionLostHint()
  assert.ok(hint.includes("#抖音bot登录"))
})
