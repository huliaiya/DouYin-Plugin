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
  if (uri && !/\.(mp3|m4a)(\?|$)/i.test(uri)) {
    push(`https://aweme.snssdk.com/aweme/v1/play/?video_id=${encodeURIComponent(uri)}&ratio=1080p&line=0`)
  }
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

// 网页作品详情（iteminfo 接口）：web 端指纹参数 + 网页 cookie，返回作品详情（含视频 vid 与图文图片）
const ITEM_INFO_URL = "https://aweme.snssdk.com/web/api/v2/aweme/iteminfo/"

function cookieValue(cookie, name) {
  const match = String(cookie || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? match[1] : ""
}

export function buildItemInfoUrl(awemeId, cookie = "") {
  const params = new URLSearchParams({
    aid: "6383",
    channel: "channel_pc_web",
    pc_client_type: "1",
    version_code: "190500",
    version_name: "19.5.0",
    cookie_enabled: "true",
    screen_width: "1920",
    screen_height: "1080",
    browser_language: "zh-CN",
    browser_platform: "Win32",
    browser_name: "Chrome",
    browser_version: "126.0.0.0",
    browser_online: "true",
    engine: "Blink",
    engine_version: "126.0.0.0",
    os_name: "Windows",
    os_version: "10",
    device_platform: "webapp",
    item_ids: awemeId,
    aweme_id: awemeId,
  })
  const webid = cookieValue(cookie, "s_v_web_id")
  const uifid = cookieValue(cookie, "UIFID")
  if (webid) params.set("webid", webid)
  if (uifid) params.set("uifid", uifid)
  return `${ITEM_INFO_URL}?${params}`
}

export async function fetchItemInfoDetail(awemeId, cookie, { timeout = 20000 } = {}) {
  if (!cookie) throw new Error("未提供网页 cookie")
  const res = await fetch(buildItemInfoUrl(awemeId, cookie), {
    headers: { "User-Agent": BROWSER_UA, Accept: "application/json", Referer: "https://www.douyin.com/", Cookie: cookie },
    signal: AbortSignal.timeout(timeout),
  })
  const text = await res.text()
  if (!text) throw new Error("作品详情响应为空")
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`作品详情响应非 JSON：${text.slice(0, 120)}`)
  }
  if (Number(data?.status_code ?? -1) !== 0) throw new Error(`作品详情状态异常：${data?.status_code ?? "?"} ${data?.status_msg || ""}`)
  const detail = Array.isArray(data?.item_list) ? data.item_list[0] : data?.aweme_detail
  if (!detail) throw new Error("作品详情为空")
  return detail
}

// 图文作品的图片地址：优先原始格式，其次 webp
export function pickImageUrls(detail) {
  const images = Array.isArray(detail?.images) ? detail.images : []
  const urls = []
  for (const image of images) {
    const list = Array.isArray(image?.url_list) ? image.url_list : []
    const original = list.find(url => typeof url === "string" && /\.(jpe?g|png)(\?|$)/i.test(url))
    const fallback = list.find(url => typeof url === "string" && url.startsWith("http"))
    const url = original || fallback
    if (url && !urls.includes(url)) urls.push(url)
  }
  return urls
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

export async function downloadImage(url, { timeout = 60000 } = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA, Referer: "https://www.douyin.com/" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeout),
  })
  if (!res.ok) throw new Error(`图片下载失败 HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 1024) throw new Error(`图片内容过小：${buf.length}B`)
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

function pickApiImages(data) {
  const images = [data?.image_url, ...(Array.isArray(data?.images) ? data.images : [])]
  return [...new Set(images.filter(url => typeof url === "string" && url.startsWith("http")))]
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
  return { urls: pickApiUrls(data), images: pickApiImages(data) }
}
