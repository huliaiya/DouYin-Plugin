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
  const isMusicUrl = url => /\/ies-music\//i.test(url) || /\.(mp3|m4a)(\?|$)/i.test(url)
  const push = value => {
    if (typeof value === "string" && value.startsWith("http") && !isMusicUrl(value) && !urls.includes(value)) urls.push(value)
  }
  const uri = video.play_addr?.uri ?? video.play_addr_h264?.uri
  if (uri && !isMusicUrl(uri)) {
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

// 匿名 ttwid：访客标识，iteminfo 接口凭此 cookie 即可取到作品详情，无需登录态
const TTWID_REGISTER_URL = "https://ttwid.bytedance.com/ttwid/union/register/"
const TTWID_TTL = 30 * 60 * 1000
let ttwidCache = { value: "", at: 0 }

function readSetCookie(headers) {
  if (typeof headers?.getSetCookie === "function") return headers.getSetCookie()
  const raw = headers?.get?.("set-cookie")
  return raw ? [raw] : []
}

export async function registerAnonymousTtwid({ timeout = 15000 } = {}) {
  const res = await fetch(TTWID_REGISTER_URL, {
    method: "POST",
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "application/json",
      Referer: "https://www.douyin.com/",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      aid: 1768,
      union: true,
      needFid: false,
      region: "cn",
      cbUrlProtocol: "https",
      service: "www.ixigua.com",
      migrate_info: { ticket: "", source: "node" },
    }),
    signal: AbortSignal.timeout(timeout),
  })
  const hit = readSetCookie(res.headers).map(String).find(item => item.includes("ttwid=")) ?? ""
  const value = hit.match(/ttwid=([^;]+)/)?.[1] ?? ""
  if (!value) throw new Error("匿名 ttwid 获取失败")
  ttwidCache = { value, at: Date.now() }
  return value
}

export function resetTtwidCache() {
  ttwidCache = { value: "", at: 0 }
}

export async function getAnonymousTtwid() {
  if (ttwidCache.value && Date.now() - ttwidCache.at < TTWID_TTL) return ttwidCache.value
  return registerAnonymousTtwid()
}

// 作品详情解析：优先用配置的网页 cookie，失效时回退匿名 ttwid
export async function fetchItemInfoDetailAuto(awemeId, cookie = "", { timeout = 20000 } = {}) {
  const errors = []
  if (cookie) {
    try {
      return await fetchItemInfoDetail(awemeId, cookie, { timeout })
    } catch (err) {
      errors.push(`网页 cookie：${err?.message || err}`)
    }
  }
  try {
    const ttwid = await getAnonymousTtwid()
    return await fetchItemInfoDetail(awemeId, `ttwid=${ttwid}`, { timeout })
  } catch (err) {
    errors.push(`匿名 ttwid：${err?.message || err}`)
  }
  throw new Error(errors.join("；"))
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

// 作品背景音乐地址：music.play_url 为通用来源，图文作品的 video.play_addr 指向背景音乐
export function pickMusicUrl(detail) {
  const candidates = [
    ...(Array.isArray(detail?.music?.play_url?.url_list) ? detail.music.play_url.url_list : []),
    detail?.music?.play_url?.uri,
    detail?.video?.play_addr?.uri,
  ]
  for (const value of candidates) {
    if (typeof value !== "string" || !value.startsWith("http")) continue
    if (!/\.(mp3|m4a)(\?|$)/i.test(value) && !/\/ies-music/i.test(value)) continue
    return value
  }
  return ""
}

// 音乐详情接口：作品详情里的 play_url 常为空，原声音乐地址藏在 music_info.extra
export function buildMusicDetailUrl(musicId) {
  const url = new URL("https://www.douyin.com/aweme/v1/music/detail/")
  url.searchParams.set("music_id", String(musicId))
  url.searchParams.set("aid", "6383")
  return url.toString()
}

function pickMusicFromExtra(extra) {
  if (typeof extra !== "string") return ""
  try {
    const parsed = JSON.parse(extra)
    return typeof parsed?.original_song_url === "string" ? parsed.original_song_url : ""
  } catch {
    return ""
  }
}

// 背景音乐直链：优先作品详情自带的地址，缺失时按音乐 mid 查询音乐详情接口
export async function fetchMusicUrl(detail, { cookie = "", timeout = 20000 } = {}) {
  const direct = pickMusicUrl(detail)
  if (direct) return direct
  const musicId = detail?.music?.mid ?? detail?.music?.id
  if (!musicId) return ""
  const res = await fetch(buildMusicDetailUrl(musicId), {
    headers: {
      "User-Agent": BROWSER_UA,
      Referer: "https://www.douyin.com/",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    signal: AbortSignal.timeout(timeout),
  })
  if (!res.ok) throw new Error(`音乐详情请求失败 HTTP ${res.status}`)
  const data = await res.json()
  const info = data?.music_info ?? {}
  const fromExtra = pickMusicFromExtra(info.extra)
  if (fromExtra) return fromExtra
  return pickMusicUrl({ music: { play_url: info.play_url } })
}

async function downloadMedia(url, { timeout, minSize, label }) {
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA, Referer: "https://www.douyin.com/" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeout),
  })
  if (!res.ok) throw new Error(`${label}下载失败 HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < minSize) throw new Error(`${label}内容过小：${buf.length}B`)
  return buf
}

export async function downloadVideo(url, { timeout = 120000 } = {}) {
  return downloadMedia(url, { timeout, minSize: 1024, label: "视频" })
}

export async function downloadImage(url, { timeout = 60000 } = {}) {
  return downloadMedia(url, { timeout, minSize: 1024, label: "图片" })
}

export async function downloadMusic(url, { timeout = 60000 } = {}) {
  return downloadMedia(url, { timeout, minSize: 512, label: "音乐" })
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

function pickApiMusic(data) {
  const music = data?.music_url ?? data?.music
  if (typeof music === "string" && music.startsWith("http")) return music
  if (Array.isArray(music)) return music.find(url => typeof url === "string" && url.startsWith("http")) ?? ""
  return ""
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
  return { urls: pickApiUrls(data), images: pickApiImages(data), music: pickApiMusic(data) }
}
