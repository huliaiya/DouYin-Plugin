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
