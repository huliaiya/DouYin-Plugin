import { Transform } from "node:stream"

// 媒体域名白名单：代理路由与媒体下载只接受抖音官方 CDN 域名，
// 避免开放代理被用于 SSRF（探测内网/云元数据）或把账号 Cookie 外发到第三方服务器
export const MEDIA_HOST_SUFFIXES = [
  "douyin.com",
  "douyinpic.com",
  "douyinvod.com",
  "amemv.com",
  "byteimg.com",
  "byteimg.cn",
  "bytecdn.cn",
  "feoffline.com",
  "zjcdn.com",
  "ixigua.com",
  "pstatp.com",
  "snssdk.com",
  "volccdn.com",
  "douyinstatic.com",
]

// 媒体请求约束：单次请求 30 秒、响应体最大 64MB，超限即中断，防止代理被用于打满内存与带宽
export const MEDIA_FETCH_TIMEOUT = 30000
export const MEDIA_MAX_BYTES = 64 * 1024 * 1024

// 归一化用户自定义域名后缀：仅接受形如 example.com 的普通域名，剔除非法字符
function normalizeExtraSuffixes(list) {
  if (!Array.isArray(list)) return []
  return list
    .map(s => String(s).trim().toLowerCase().replace(/^\.+/, ""))
    .filter(s => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s))
}

// 校验媒体 URL 是否命中抖音官方域名白名单（可叠加用户自定义后缀），命中返回 URL 对象，否则返回 null
export function allowedMediaUrl(raw, extraSuffixes = []) {
  const text = raw instanceof URL ? raw.toString() : raw
  if (typeof text !== "string" || !/^https?:\/\//i.test(text)) return null
  let u
  try {
    u = new URL(text)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase()
  const suffixes = [...MEDIA_HOST_SUFFIXES, ...normalizeExtraSuffixes(extraSuffixes)]
  return suffixes.some(suffix => host === suffix || host.endsWith(`.${suffix}`)) ? u : null
}

// 体积限制流：累计字节数超过上限即中断，防止超大响应打满内存
export function limitStream(maxBytes) {
  let total = 0
  return new Transform({
    transform(chunk, enc, cb) {
      total += chunk.length
      if (total > maxBytes) {
        cb(new Error(`媒体响应超过 ${maxBytes} 字节上限`))
        this.destroy()
        return
      }
      cb(null, chunk)
    },
  })
}
