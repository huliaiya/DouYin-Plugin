const WEB_PROFILE_URL =
  "https://www.douyin.com/aweme/v1/web/user/profile/self/?aid=6383&device_platform=webapp&channel=channel_pc_web&version_code=190500&version_name=19.5.0&cookie_enabled=true&screen_width=1920&screen_height=1080&browser_language=zh-CN&browser_platform=Win32&browser_name=Chrome&browser_version=124.0.0.0&browser_online=true&engine_name=Blink&engine_version=124.0.0.0&os_name=Windows&os_version=10&cpu_core_num=16&device_memory=8&platform=PC&downlink=10&effective_type=4g&round_trip_time=50"

const WEB_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

export function normalizeCookie(raw) {
  return String(raw ?? "")
    .split(";")
    .map(part => {
      const text = part.trim().replace(/\s+/g, " ")
      if (!text) return ""
      const index = text.indexOf("=")
      if (index < 0) return text
      const name = text.slice(0, index).trim()
      const value = text.slice(index + 1).trim()
      return name ? `${name}=${value}` : ""
    })
    .filter(Boolean)
    .join("; ")
}

/**
 * 解析 cookie 输入：支持 Cookie-Editor 导出的 JSON 数组、JSON 对象映射、普通 cookie 字符串
 */
export function parseCookieInput(raw) {
  const text = String(raw ?? "").trim()
  if (!text) return ""
  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      const data = JSON.parse(text)
      const items = Array.isArray(data)
        ? data
        : Object.entries(data).map(([name, value]) => ({ name, value }))
      const pairs = items
        .map(item => {
          if (item && typeof item === "object" && item.name != null) {
            return `${item.name}=${item.value ?? ""}`
          }
          return ""
        })
        .filter(Boolean)
      if (pairs.length) return pairs.join("; ")
    } catch {
      // JSON 不合法时按普通 cookie 字符串处理
    }
  }
  return normalizeCookie(text)
}

export function hasCookiePairs(cookie) {
  const text = String(cookie ?? "")
  return text.includes("=") && text.includes(";")
}

export async function resolveWebAccount(cookie, { timeout = 15000 } = {}) {
  const res = await fetch(WEB_PROFILE_URL, {
    headers: {
      "User-Agent": WEB_UA,
      Referer: "https://www.douyin.com/",
      Cookie: cookie,
    },
    signal: AbortSignal.timeout(timeout),
  })
  const data = await res.json().catch(() => ({}))
  const user = data?.data?.user ?? data?.user
  const uid = user?.uid ?? user?.user_id_str ?? user?.user_id
  if (!uid) {
    const reason = data?.status_msg || data?.message || `HTTP ${res.status}`
    throw new Error(`cookie 校验失败（${reason}），请确认 cookie 完整且未过期`)
  }
  return {
    uid: String(uid),
    nickname: typeof user.nickname === "string" ? user.nickname : "",
  }
}
