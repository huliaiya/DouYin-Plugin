import test from "node:test"
import assert from "node:assert/strict"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { allowedMediaUrl, limitStream, MEDIA_MAX_BYTES } from "../lib/guard.js"

test("白名单：抖音官方域名及其子域名放行", () => {
  const allowed = [
    "https://p3.douyinpic.com/img/abc.jpeg",
    "https://v3-web.douyinvod.com/abc/video.mp4",
    "https://lf26-douyin-web.feoffline.com/a.jpg",
    "https://www.douyin.com/aweme/v1/web/feed/",
    "https://lf1-cmcdn-zhcdn-tos.douyinstatic.com/icon.png",
    "https://lf1.byteimg.cn/obj/x.png",
    "http://p9-sign.douyinpic.com/img/x.webp",
  ]
  for (const url of allowed) assert.ok(allowedMediaUrl(url), `应放行 ${url}`)
})

test("白名单：URL 实例与字符串输入一致", () => {
  const u = new URL("https://p3.douyinpic.com/img/x.jpg")
  assert.ok(allowedMediaUrl(u))
  assert.equal(allowedMediaUrl(new URL("https://evil.example.com/x.jpg")), null)
})
test("白名单：用户自定义后缀可追加，非法后缀被忽略", () => {
  assert.ok(allowedMediaUrl("https://cdn.my-site.com/a.jpg", ["my-site.com"]))
  assert.ok(allowedMediaUrl("https://cdn.my-site.com/a.jpg", [".my-site.com"]))
  assert.equal(allowedMediaUrl("https://cdn.other.com/a.jpg", ["my-site.com"]), null)
  assert.equal(allowedMediaUrl("https://cdn.my-site.com/a.jpg", ["*", "not a domain", ""]), null)
  assert.equal(allowedMediaUrl("https://cdn.my-site.com/a.jpg", "my-site.com"), null)
})

test("白名单：非抖音域名一律拒绝", () => {
  const denied = [
    "https://evil.example.com/x.jpg",
    "https://github.com/huliaiya/DouYin-Plugin",
    "https://douyin.com.evil.example/x.jpg",
    "https://notdouyin.com/x.jpg",
    "https://evil-douyin.com/x.jpg",
  ]
  for (const url of denied) assert.equal(allowedMediaUrl(url), null, `应拒绝 ${url}`)
})

test("白名单：内网、回环与云元数据地址拒绝", () => {
  const denied = [
    "http://127.0.0.1:2536/",
    "http://localhost:6379/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://[::1]/",
  ]
  for (const url of denied) assert.equal(allowedMediaUrl(url), null, `应拒绝 ${url}`)
})

test("白名单：非 http(s) 协议与畸形输入拒绝", () => {
  const denied = ["ftp://p3.douyinpic.com/x", "javascript:alert(1)", "file:///etc/passwd", "not-a-url", "", null, undefined, 123]
  for (const url of denied) assert.equal(allowedMediaUrl(url), null, `应拒绝 ${String(url)}`)
})

test("体积限制：超出上限的流被中断", async () => {
  const source = Readable.from([Buffer.alloc(1024), Buffer.alloc(1024)])
  await assert.rejects(pipeline(source, limitStream(1000), new (await import("node:stream")).Writable({ write(c, e, cb) { cb() } })))
})

test("体积限制：未超限的流正常透传", async () => {
  const chunks = []
  const sink = new (await import("node:stream")).Writable({
    write(chunk, enc, cb) {
      chunks.push(chunk)
      cb()
    },
  })
  await pipeline(Readable.from([Buffer.alloc(512), Buffer.alloc(512)]), limitStream(MEDIA_MAX_BYTES), sink)
  assert.equal(chunks.reduce((sum, c) => sum + c.length, 0), 1024)
})
