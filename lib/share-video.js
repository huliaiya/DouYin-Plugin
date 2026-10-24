// 抖音分享作品原片回传：取作品详情中的播放地址并下载视频字节。
// douyin.ts 的 web 详情接口依赖网页会话，网页会话失效时回退 App 详情接口（无需登录态）。
const APP_DETAIL_URL = "https://aweme.snssdk.com/aweme/v1/aweme/detail/"
const APP_UA =
  "com.ss.android.ugc.aweme/280400 (Linux; U; Android 13; zh_CN; SM-S918B; Build/TP1A.220624.014; Cronet/TTNetVersion:5f9640e5 2023-03-27 QuicVersion:47946d2a)"
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

// 播放地址优先级：App 无水印接口 → download_addr → play_addr_h264 → play_addr → bit_rate
export function pickVideoUrls(detail) {
  const video = detail?.video ?? {}
  const urls = []
  const push = value => {
    if (typeof value === "string" && value.startsWith("http") && !urls.includes(value)) urls.push(value)
  }
  const uri = video.play_addr?.uri ?? video.play_addr_h264?.uri
  if (uri) push(`https://aweme.snssdk.com/aweme/v1/play/?video_id=${encodeURIComponent(uri)}&ratio=1080p&line=0`)
  for (const list of [
    video.download_addr?.url_list,
    video.play_addr_h264?.url_list,
    video.play_addr?.url_list,
    ...(video.bit_rate ?? []).map(item => item.play_addr?.url_list),
  ]) {
    for (const url of list ?? []) push(url)
  }
  return urls
}

export async function fetchAppAwemeDetail(awemeId, { timeout = 20000 } = {}) {
  const url = `${APP_DETAIL_URL}?aweme_id=${encodeURIComponent(awemeId)}&aid=1128&version_code=280400&device_platform=android&app_name=aweme`
  const res = await fetch(url, {
    headers: { "User-Agent": APP_UA, Accept: "application/json" },
    signal: AbortSignal.timeout(timeout),
  })
  if (!res.ok) throw new Error(`作品详情请求失败 HTTP ${res.status}`)
  const text = await res.text()
  if (!text) throw new Error("作品详情响应为空")
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`作品详情响应非 JSON：${text.slice(0, 120)}`)
  }
  const detail = data?.aweme_detail
  if (!detail) throw new Error(`作品详情为空：status_code=${data?.status_code ?? "?"} ${data?.status_msg ?? ""}`)
  return detail
}

// 网页作品详情（douyin.ts 的 multi 接口形态）：用指定 cookie 拉取作品详情
// 机器人扫码登录得到的是 IM 会话，网页详情接口不认；需要一份只在浏览器使用的网页 cookie
const DETAIL_HOST = "www-hj.douyin.com"
const DETAIL_PATH = "/aweme/v1/web/multi/aweme/detail/"
const DESKTOP_BROWSER_VERSION =
  "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) douyin/8.5.302 Chrome/136.0.7103.59 Electron/36.4.0-rs.31.release.pgo.7 TTElectron/36.4.0-rs.31.release.pgo.7 Safari/537.36 awemePcClient/8.5.302 buildId/469548567 osName/Windows"

export function buildWebDetailUrl(awemeId, device = {}) {
  const deviceId = String(device.deviceId || "0")
  const installId = String(device.installId || "0")
  const guid = String(device.guid || globalThis.crypto?.randomUUID?.() || "00000000-0000-4000-8000-000000000000")
  const params = new URLSearchParams({
    aid: "339757",
    version_name: "1.1.34",
    version_code: "1.1.34",
    device_platform: "win32",
    os_version: "10.0.26200",
    screen_width: "1707",
    screen_height: "1067",
    browser_language: "zh-CN",
    browser_platform: "Win32",
    browser_name: "Mozilla",
    browser_version: DESKTOP_BROWSER_VERSION,
    browser_online: "true",
    cookie_enabled: "true",
    device_id: deviceId,
    did: deviceId,
    iid: installId,
    awemeim_guid: guid,
    channel: "0",
    aweme_ids: JSON.stringify([awemeId]),
    origin_type: "chat",
    request_source: "3",
  })
  return `https://${DETAIL_HOST}${DETAIL_PATH}?${params}`
}

export async function fetchWebAwemeDetail(sdk, awemeId, cookie) {
  if (!cookie) throw new Error("未提供网页 cookie")
  const url = buildWebDetailUrl(awemeId, sdk?.device || {})
  const res = await sdk.http().json(url, {
    method: "POST",
    headers: {
      Referer: "https://www.douyin.com/",
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: "{}",
  })
  const details = res?.data?.aweme_details
  const detail = Array.isArray(details) ? details[0] : res?.data?.aweme_detail
  if (!detail) throw new Error(`作品详情为空：HTTP ${res?.status ?? "?"} ${JSON.stringify(res?.data ?? {}).slice(0, 120)}`)
  return detail
}

export async function downloadVideo(url, { timeout = 120000 } = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA, Referer: "https://www.douyin.com/" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeout),
  })
  if (!res.ok) throw new Error(`视频下载失败 HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 1024) throw new Error(`视频内容过小：${buf.length}B`)
  return buf
}

// 外部解析服务：POST {api} body {url, cookie, token}，返回 {code, video_url, urls[]}
// cookie 由机器人账号带上，解析服务无需自行保存；POST 失败时回退 GET {api}?url=..&type=json
export function buildApiQuery(apiUrl, awemeId, token = "") {
  const query = `url=${encodeURIComponent(awemeId)}&type=json`
  return `${apiUrl}${apiUrl.includes("?") ? "&" : "?"}${query}${token ? `&token=${encodeURIComponent(token)}` : ""}`
}

function pickApiUrls(data) {
  const urls = [data?.video_url, ...(Array.isArray(data?.urls) ? data.urls : [])]
  return [...new Set(urls.filter(url => typeof url === "string" && url.startsWith("http")))]
}

export async function fetchVideoUrlsFromApi(apiUrl, awemeId, { cookie = "", parseCookie = "", token = "", timeout = 20000 } = {}) {
  let data = null
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ url: awemeId, cookie, parse_cookie: parseCookie, token, type: "json" }),
      signal: AbortSignal.timeout(timeout),
    })
    data = await res.json().catch(() => null)
  } catch {
    data = null
  }
  if (!data || typeof data !== "object") {
    const res = await fetch(buildApiQuery(apiUrl, awemeId, token), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeout),
    })
    if (!res.ok) throw new Error(`解析服务返回 HTTP ${res.status}`)
    data = await res.json()
  }
  if (data?.code !== 0) {
    const detail = data?.trace ? ` ${JSON.stringify(data.trace)}` : ""
    throw new Error(`解析服务返回失败：${data?.message || data?.code}${detail}`)
  }
  return pickApiUrls(data)
}
