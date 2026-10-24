const WEB_PROFILE_URL =
  "https://www.douyin.com/aweme/v1/web/user/profile/self/?aid=6383&device_platform=webapp&channel=channel_pc_web&version_code=190500&version_name=19.5.0&cookie_enabled=true&screen_width=1920&screen_height=1080&browser_language=zh-CN&browser_platform=Win32&browser_name=Chrome&browser_version=124.0.0.0&browser_online=true&engine_name=Blink&engine_version=124.0.0.0&os_name=Windows&os_version=10&cpu_core_num=16&device_memory=8&platform=PC&downlink=10&effective_type=4g&round_trip_time=50"

const WEB_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

export function normalizeCookie(raw) {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
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
