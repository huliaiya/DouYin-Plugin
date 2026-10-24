// 抖音分享作品原片回传：取作品详情中的播放地址并下载视频字节。
// douyin.ts 的 web 详情接口依赖网页会话，网页会话失效时回退 App 详情接口（无需登录态）。
const APP_DETAIL_URL = "https://aweme.snssdk.com/aweme/v1/aweme/detail/"
const APP_UA =
  "com.ss.android.ugc.aweme/280400 (Linux; U; Android 13; zh_CN; SM-S918B; Build/TP1A.220624.014; Cronet/TTNetVersion:5f9640e5 2023-03-27 QuicVersion:47946d2a)"
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

// 图文作品的 music.play_url 与 video.play_addr 指向同一个音频对象，播放地址需按音乐引用剔除
function musicObjectRefs(detail) {
  const playUrl = detail?.music?.play_url
  const refs = []
  for (const value of [playUrl?.uri, ...(Array.isArray(playUrl?.url_list) ? playUrl.url_list : [])]) {
    if (typeof value === "string" && value.startsWith("http")) refs.push(value)
  }
  return refs
}

// 播放地址优先级：App 无水印接口 → download_addr → play_addr_h264 → play_addr → bit_rate
export function pickVideoUrls(detail) {
  const video = detail?.video ?? {}
  const urls = []
  const refs = musicObjectRefs(detail)
  const isMusicUrl = url => /\/ies-music\//i.test(url) || /\.(mp3|m4a)(\?|$)/i.test(url)
  const isMusicObject = url => {
    if (!refs.length) return false
    let decoded = url
    try {
      decoded = decodeURIComponent(url)
    } catch {}
    return refs.some(ref => url.includes(ref) || decoded.includes(ref))
  }
  const push = value => {
    if (typeof value !== "string" || !value.startsWith("http")) return
    if (isMusicUrl(value) || isMusicObject(value) || urls.includes(value)) return
    urls.push(value)
  }
  const uri = video.play_addr?.uri ?? video.play_addr_h264?.uri
  if (uri && !isMusicUrl(uri) && !isMusicObject(uri)) {
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
const COMMENT_LIST_URL = "https://www.iesdouyin.com/web/api/v2/comment/list/"

function cookieValue(cookie, name) {
  const match = String(cookie || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? match[1] : ""
}

// web 端指纹参数：iteminfo、评论列表等网页接口共用
function webFingerprintParams() {
  return new URLSearchParams({
    aid: "6383",
    app_name: "aweme",
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
  })
}

export function buildItemInfoUrl(awemeId, cookie = "") {
  const params = webFingerprintParams()
  params.set("item_ids", awemeId)
  params.set("aweme_id", awemeId)
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

// 作品背景音乐地址：music.play_url 为通用来源（图文作品为 audio/mp4，无扩展名），
// music.play_url 缺失时回退 video.play_addr 的音乐地址
export function pickMusicUrl(detail) {
  const candidates = [
    ...(Array.isArray(detail?.music?.play_url?.url_list) ? detail.music.play_url.url_list : []),
    detail?.music?.play_url?.uri,
  ]
  for (const value of candidates) {
    if (typeof value === "string" && value.startsWith("http")) return value
  }
  const fallback = detail?.video?.play_addr?.uri
  if (typeof fallback === "string" && fallback.startsWith("http") && (/\.(mp3|m4a)(\?|$)/i.test(fallback) || /\/ies-music/i.test(fallback))) return fallback
  return ""
}

// 音乐容器类型：ID3 或 MPEG 帧头为 mp3，ftyp 盒为 m4a
export function musicFileExtension(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return "mp3"
  if (buf.subarray(0, 3).toString() === "ID3") return "mp3"
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "mp3"
  if (buf.subarray(4, 8).toString() === "ftyp") return "m4a"
  return "mp3"
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

// 音频对象探测：图文作品的 video.play_addr 可能是无扩展名的音频，按响应类型判定
async function probeAudioUrl(url, { timeout = 8000 } = {}) {
  if (typeof url !== "string" || !url.startsWith("http")) return ""
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": BROWSER_UA, Referer: "https://www.douyin.com/", Range: "bytes=0-1023" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeout),
    })
    const type = String(res.headers.get("content-type") || "")
    return type.toLowerCase().startsWith("audio/") ? url : ""
  } catch {
    return ""
  }
}

// 背景音乐直链：优先作品详情自带的地址，缺失时按音乐 mid 查询音乐详情接口
export async function fetchMusicUrl(detail, { cookie = "", timeout = 20000 } = {}) {
  const direct = pickMusicUrl(detail)
  if (direct) return direct
  const musicId = detail?.music?.mid ?? detail?.music?.id
  if (musicId) {
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
    const fromDetail = pickMusicUrl({ music: { play_url: info.play_url } })
    if (fromDetail) return fromDetail
  }
  return await probeAudioUrl(detail?.video?.play_addr?.uri)
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

// 解析服务返回的作品信息：优先 meta 字段，其次顶层字段
function pickApiMeta(data) {
  const raw = data?.meta && typeof data.meta === "object" ? data.meta : data ?? {}
  const statistics = raw?.statistics ?? {}
  const num = value => (typeof value === "number" && Number.isFinite(value) ? value : undefined)
  const meta = {
    author: String(raw?.author ?? data?.author ?? "").trim(),
    desc: String(raw?.desc ?? data?.desc ?? data?.title ?? "").trim(),
    play: num(statistics.play_count ?? raw?.play),
    digg: num(statistics.digg_count ?? raw?.digg),
    comment: num(statistics.comment_count ?? raw?.comment),
    share: num(statistics.share_count ?? raw?.share),
    collect: num(statistics.collect_count ?? raw?.collect),
  }
  const known = Object.entries(meta).some(([key, value]) => key !== "play" && value !== undefined && value !== "")
  return known ? meta : null
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
  return { urls: pickApiUrls(data), images: pickApiImages(data), music: pickApiMusic(data), meta: pickApiMeta(data) }
}

// 作品信息：作者、文案与互动数据
export function pickShareMeta(detail) {
  const statistics = detail?.statistics ?? {}
  const num = value => (typeof value === "number" && Number.isFinite(value) ? value : undefined)
  return {
    author: String(detail?.author?.nickname ?? "").trim(),
    desc: String(detail?.desc ?? "").trim(),
    play: num(statistics.play_count),
    digg: num(statistics.digg_count),
    comment: num(statistics.comment_count),
    share: num(statistics.share_count),
    collect: num(statistics.collect_count),
  }
}

const META_FIELDS = {
  author: { aliases: ["author", "作者", "nickname"], label: "作者", unknown: "未知" },
  desc: { aliases: ["desc", "简介", "文案", "title"], label: "简介", unknown: "" },
  play: { aliases: ["play", "播放", "播放量", "play_count"], label: "播放", unknown: "未知" },
  digg: { aliases: ["digg", "点赞", "点赞数", "like", "digg_count"], label: "点赞", unknown: "0" },
  comment: { aliases: ["comment", "评论", "评论数", "comment_count"], label: "评论", unknown: "0" },
  share: { aliases: ["share", "分享", "分享数", "share_count"], label: "分享", unknown: "0" },
  collect: { aliases: ["collect", "收藏", "收藏数", "collect_count"], label: "收藏", unknown: "0" },
}

export const META_FIELD_NAMES = Object.keys(META_FIELDS)

export function parseMetaFields(input) {
  const list = String(input ?? "")
    .split(/[,，\s]+/)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
  const fields = []
  for (const item of list) {
    const key = META_FIELD_NAMES.find(name => META_FIELDS[name].aliases.includes(item))
    if (key && !fields.includes(key)) fields.push(key)
  }
  return fields
}

// 计数缩写：12345 → 1.2万
export function formatCount(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return ""
  if (value >= 100000000) return `${(value / 100000000).toFixed(1).replace(/\.0$/, "")}亿`
  if (value >= 10000) return `${(value / 10000).toFixed(1).replace(/\.0$/, "")}万`
  return String(value)
}

// 作品信息文案：字段顺序与模板可配置，模板变量 {author} {desc} {play} {digg} {comment} {share} {collect}
export function formatShareMeta(meta, { fields = "author,desc,play,digg,comment", template = "" } = {}) {
  const selected = parseMetaFields(fields)
  const list = selected.length ? selected : ["author", "desc", "play", "digg", "comment"]
  const values = {}
  for (const key of META_FIELD_NAMES) {
    const raw = meta?.[key]
    if (key === "play") {
      values[key] = typeof raw === "number" && raw > 0 ? formatCount(raw) : "未知"
      continue
    }
    values[key] = typeof raw === "number" ? formatCount(raw) : String(raw ?? "")
  }
  if (template?.trim()) {
    return template
      .replace(/\\n/g, "\n")
      .replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  }
  const lines = []
  for (const key of list) {
    const spec = META_FIELDS[key]
    const value = values[key]
    if (key === "play") {
      lines.push(`${spec.label}：${value}`)
      continue
    }
    if (!value) continue
    lines.push(`${spec.label}：${value}`)
  }
  return lines.join("\n").trim()
}

export function buildCommentListUrl(awemeId, count = 5) {
  const params = webFingerprintParams()
  params.set("aweme_id", awemeId)
  params.set("item_id", awemeId)
  params.set("cursor", "0")
  params.set("count", String(Math.min(Math.max(Number(count) || 5, 1), 20)))
  params.set("item_type", "0")
  return `${COMMENT_LIST_URL}?${params}`
}

// 热门评论：网页评论接口，凭网页 cookie 或匿名 ttwid 获取
export async function fetchTopComments(awemeId, { count = 3, cookie = "", timeout = 20000 } = {}) {
  const requestCookie = cookie || (await getAnonymousTtwid())
  const res = await fetch(buildCommentListUrl(awemeId, count), {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "application/json",
      Referer: "https://www.douyin.com/",
      Cookie: requestCookie,
    },
    signal: AbortSignal.timeout(timeout),
  })
  if (!res.ok) throw new Error(`评论列表请求失败 HTTP ${res.status}`)
  const text = await res.text()
  if (!text) throw new Error("评论列表响应为空")
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`评论列表响应非 JSON：${text.slice(0, 120)}`)
  }
  const list = Array.isArray(data?.comments) ? data.comments : []
  return list.slice(0, Math.min(Math.max(Number(count) || 3, 1), 20)).map(item => ({
    text: String(item?.text ?? "").trim(),
    user: String(item?.user?.nickname ?? "").trim(),
    digg: typeof item?.digg_count === "number" ? item.digg_count : 0,
  }))
}

// 热门评论文案
export function formatComments(comments) {
  const list = (comments ?? []).filter(item => item?.text)
  if (!list.length) return ""
  const lines = list.map((item, index) => {
    const user = item.user ? `${item.user}：` : ""
    const digg = item.digg ? `（赞 ${formatCount(item.digg)}）` : ""
    return `${index + 1}. ${user}${item.text}${digg}`
  })
  return `热门评论：\n${lines.join("\n")}`
}
