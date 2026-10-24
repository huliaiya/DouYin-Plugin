import test from "node:test"
import assert from "node:assert/strict"
import {
  buildApiQuery,
  buildItemInfoUrl,
  fetchItemInfoDetail,
  fetchVideoUrlsFromApi,
  pickImageUrls,
  pickVideoUrls,
} from "../lib/share-video.js"

test("作品详情请求地址：web 指纹参数与作品编号", () => {
  const url = new URL(
    buildItemInfoUrl("7699765354280520969", "s_v_web_id=web-123; UIFID=ui-456; sessionid=abc"),
  )
  assert.equal(url.host, "aweme.snssdk.com")
  assert.equal(url.pathname, "/web/api/v2/aweme/iteminfo/")
  assert.equal(url.searchParams.get("item_ids"), "7699765354280520969")
  assert.equal(url.searchParams.get("aweme_id"), "7699765354280520969")
  assert.equal(url.searchParams.get("aid"), "6383")
  assert.equal(url.searchParams.get("device_platform"), "webapp")
  assert.equal(url.searchParams.get("webid"), "web-123")
  assert.equal(url.searchParams.get("uifid"), "ui-456")
})

test("作品详情请求地址：cookie 缺少 webid 时不追加空参数", () => {
  const url = new URL(buildItemInfoUrl("123", "sessionid=abc"))
  assert.equal(url.searchParams.get("webid"), null)
  assert.equal(url.searchParams.get("uifid"), null)
})

test("作品详情解析：返回 item_list 首条并携带 cookie", async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    return new Response(JSON.stringify({ status_code: 0, item_list: [{ aweme_id: "123", aweme_type: 4 }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }
  try {
    const detail = await fetchItemInfoDetail("123", "sessionid=abc")
    assert.equal(detail.aweme_id, "123")
    assert.equal(calls.length, 1)
    assert.equal(calls[0].options.headers.Cookie, "sessionid=abc")
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("作品详情解析：状态异常时抛错", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ status_code: 11110, status_msg: "参数不合法" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  try {
    await assert.rejects(() => fetchItemInfoDetail("123", "sessionid=abc"), /状态异常/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("图文图片地址：优先原始格式并去重", () => {
  const urls = pickImageUrls({
    images: [
      { url_list: ["https://p1.douyinpic.com/a.webp", "https://p1.douyinpic.com/a.jpeg"] },
      { url_list: ["https://p2.douyinpic.com/b.webp", "https://p2.douyinpic.com/b.jpeg"] },
    ],
  })
  assert.deepEqual(urls, ["https://p1.douyinpic.com/a.jpeg", "https://p2.douyinpic.com/b.jpeg"])
  assert.deepEqual(pickImageUrls({}), [])
  assert.deepEqual(pickImageUrls(undefined), [])
})

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
    const result = await fetchVideoUrlsFromApi("https://api.example/douyin.php", "123", {
      cookie: "sessionid=abc",
      parseCookie: "sessionid=web",
      token: "tok",
    })
    assert.deepEqual(result.urls, ["https://cdn.example/a.mp4"])
    assert.deepEqual(result.images, [])
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
    const result = await fetchVideoUrlsFromApi("https://api.example/douyin.php", "123", { cookie: "sessionid=abc" })
    assert.deepEqual(result.urls, ["https://cdn.example/b.mp4"])
    assert.deepEqual(result.images, [])
    assert.equal(calls.length, 2)
    assert.equal(calls[1].options.method, undefined)
    assert.ok(calls[1].url.includes("url=123"))
  } finally {
    globalThis.fetch = originalFetch
  }
})
