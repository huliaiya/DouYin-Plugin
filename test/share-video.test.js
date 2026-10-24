import test from "node:test"
import assert from "node:assert/strict"
import { buildApiQuery, fetchVideoUrlsFromApi, pickVideoUrls } from "../lib/share-video.js"

test("播放地址优先级：无水印接口在前，去重", () => {
  const urls = pickVideoUrls({
    video: {
      play_addr: { uri: "tos-cn-i-abc/video", url_list: ["https://cdn.example/play.mp4"] },
      download_addr: { url_list: ["https://cdn.example/download.mp4"] },
      bit_rate: [{ play_addr: { url_list: ["https://cdn.example/bitrate.mp4", "https://cdn.example/play.mp4"] } }],
    },
  })
  assert.equal(urls[0], "https://aweme.snssdk.com/aweme/v1/play/?video_id=tos-cn-i-abc%2Fvideo&ratio=1080p&line=0")
  assert.ok(urls.includes("https://cdn.example/download.mp4"))
  assert.ok(urls.includes("https://cdn.example/play.mp4"))
  assert.ok(urls.includes("https://cdn.example/bitrate.mp4"))
  assert.equal(urls.length, new Set(urls).size)
})

test("播放地址容错：详情为空或字段缺失", () => {
  assert.deepEqual(pickVideoUrls(undefined), [])
  assert.deepEqual(pickVideoUrls({}), [])
  assert.deepEqual(pickVideoUrls({ video: { play_addr: { url_list: ["not-a-url"] } } }), [])
})

test("解析服务查询串拼接", () => {
  assert.equal(
    buildApiQuery("https://api.huliaiya.icu/API/douyin.php", "7699765354280520969"),
    "https://api.huliaiya.icu/API/douyin.php?url=7699765354280520969&type=json",
  )
  assert.equal(
    buildApiQuery("https://api.huliaiya.icu/API/douyin.php?token=abc", "123"),
    "https://api.huliaiya.icu/API/douyin.php?token=abc&url=123&type=json",
  )
  assert.equal(
    buildApiQuery("https://api.huliaiya.icu/API/douyin.php", "123", "tok"),
    "https://api.huliaiya.icu/API/douyin.php?url=123&type=json&token=tok",
  )
})

test("解析服务调用：POST 携带账号 cookie，失败回退 GET", async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (options.method === "POST") {
      return new Response(JSON.stringify({ code: 0, video_url: "https://cdn.example/a.mp4" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    return new Response(JSON.stringify({ code: 0, urls: ["https://cdn.example/b.mp4"] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }
  try {
    const urls = await fetchVideoUrlsFromApi("https://api.example/douyin.php", "123", {
      cookie: "sessionid=abc",
      parseCookie: "sessionid=web",
      token: "tok",
    })
    assert.deepEqual(urls, ["https://cdn.example/a.mp4"])
    assert.equal(calls.length, 1)
    assert.equal(calls[0].options.method, "POST")
    const body = JSON.parse(calls[0].options.body)
    assert.equal(body.url, "123")
    assert.equal(body.cookie, "sessionid=abc")
    assert.equal(body.parse_cookie, "sessionid=web")
    assert.equal(body.token, "tok")
    assert.equal(body.type, "json")
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("解析服务调用：POST 异常时回退 GET 且不带 cookie", async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (options.method === "POST") throw new Error("network down")
    return new Response(JSON.stringify({ code: 0, urls: ["https://cdn.example/b.mp4"] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }
  try {
    const urls = await fetchVideoUrlsFromApi("https://api.example/douyin.php", "123", { cookie: "sessionid=abc" })
    assert.deepEqual(urls, ["https://cdn.example/b.mp4"])
    assert.equal(calls.length, 2)
    assert.equal(calls[1].options.method, undefined)
    assert.ok(calls[1].url.includes("url=123"))
  } finally {
    globalThis.fetch = originalFetch
  }
})
