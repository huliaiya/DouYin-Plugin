const RISK_ERROR_PATTERNS = [
  /check_qrconnect[\s\S]*?error_code\s*=\s*7/i,
  /error_code\s*=\s*7/i,
  /访问太频繁/,
  /访问频繁/,
  /请求过于频繁/,
  /操作频繁/,
]

export function isLoginRiskError(message) {
  const text = String(message ?? "")
  if (!text) return false
  return RISK_ERROR_PATTERNS.some(pattern => pattern.test(text))
}

export function loginRiskHint() {
  return "可能触发了抖音账号风控（扫码登录接口访问过于频繁），建议间隔数分钟后再试，并确认账号已关闭登录双重验证、当前网络未被风控限制"
}

const SESSION_LOST_PATTERNS = [
  /upload credentials unavailable/i,
  /unexepcted session length/i,
  /unexpected session length/i,
  /IM proto response decode failed/i,
  /status_?code[=:]\s*8\b/i,
]

export function isSessionLostError(message) {
  const text = String(message ?? "")
  if (!text) return false
  return SESSION_LOST_PATTERNS.some(pattern => pattern.test(text))
}

export function sessionLostHint() {
  return "登录态已失效或触发风控，请重新扫码登录（#抖音bot登录）"
}
