import test from "node:test"
import assert from "node:assert/strict"
import {
  buildApiQuery,
  buildCommentListUrl,
  buildItemInfoUrl,
  buildMusicDetailUrl,
  fetchItemInfoDetail,
  fetchItemInfoDetailAuto,
  fetchMusicUrl,
  fetchTopComments,
  fetchVideoUrlsFromApi,
  formatComments,
  formatCount,
  formatShareMeta,
  imageFileExtension,
  musicFileExtension,
  parseMetaFields,
  pickImageUrls,
  pickMusicUrl,
  pickShareMeta,
  pickVideoUrls,
  registerAnonymousTtwid,
  resetTtwidCache,
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

test("播放地址容错：图文作品的背景音乐地址被过滤", () => {
  const urls = pickVideoUrls({
    video: {
      play_addr: {
        uri: "https://sf6-cdn-tos.douyinstatic.com/obj/ies-music/7698640096186354441.mp3",
        url_list: ["https://aweme.snssdk.com/aweme/v1/playwm/?video_id=https://sf6-cdn-tos.douyinstatic.com/obj/ies-music/7698640096186354441.mp3"],
      },
    },
  })
  assert.deepEqual(urls, [])
})

test("播放地址容错：图文作品的背景音乐对象地址被剔除", () => {
  const audioUri = "https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/o8BkrixQYMzZ4iMWmoifjnQI69B4AswYI1IGBA"
  const urls = pickVideoUrls({
    aweme_type: 2,
    video: {
      play_addr: {
        uri: audioUri,
        url_list: [`https://aweme.snssdk.com/aweme/v1/playwm/?video_id=${encodeURIComponent(audioUri)}&ratio=720p&line=0`],
      },
    },
    music: {
      play_url: {
        uri: audioUri,
        url_list: [audioUri, audioUri.replace("sf11-", "sf6-")],
      },
    },
  })
  assert.deepEqual(urls, [])
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

test("背景音乐地址：取 music.play_url 首个音乐直链", () => {
  const url = pickMusicUrl({
    music: {
      title: "小城夏天",
      play_url: {
        url_list: [
          "https://sf6-cdn-tos.douyinstatic.com/obj/ies-music/7698640096186354441.mp3",
          "https://sf6-cdn-tos.douyinstatic.com/obj/ies-music/7698640096186354441.mp3",
        ],
      },
    },
  })
  assert.equal(url, "https://sf6-cdn-tos.douyinstatic.com/obj/ies-music/7698640096186354441.mp3")
})

test("背景音乐地址：图文作品回退 video.play_addr 的音乐地址", () => {
  const url = pickMusicUrl({
    video: {
      play_addr: {
        uri: "https://sf6-cdn-tos.douyinstatic.com/obj/ies-music/7698640096186354441.mp3",
      },
    },
  })
  assert.equal(url, "https://sf6-cdn-tos.douyinstatic.com/obj/ies-music/7698640096186354441.mp3")
})

test("背景音乐地址：普通视频作品没有音乐时返回空", () => {
  const url = pickMusicUrl({
    video: {
      play_addr: {
        uri: "v2800fgi0000dbe1fdfog65vnogddtgg",
        url_list: ["https://aweme.snssdk.com/aweme/v1/play/?video_id=v2800fgi0000dbe1fdfog65vnogddtgg"],
      },
    },
  })
  assert.equal(url, "")
})

test("背景音乐地址：图文作品取 music.play_url 的无扩展名音频", () => {
  const url = pickMusicUrl({
    aweme_type: 2,
    music: {
      title: "至美至善进行曲",
      play_url: {
        uri: "https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/o8BkrixQYMzZ4iMWmoifjnQI69B4AswYI1IGBA",
        url_list: [
          "https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/o8BkrixQYMzZ4iMWmoifjnQI69B4AswYI1IGBA",
          "https://sf6-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/o8BkrixQYMzZ4iMWmoifjnQI69B4AswYI1IGBA",
        ],
      },
    },
  })
  assert.equal(url, "https://sf11-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/o8BkrixQYMzZ4iMWmoifjnQI69B4AswYI1IGBA")
})

test("音乐容器类型：ID3 与 MPEG 帧头识别为 mp3，ftyp 盒识别为 m4a", () => {
  assert.equal(musicFileExtension(Buffer.from("49443304000000000000", "hex")), "mp3")
  assert.equal(musicFileExtension(Buffer.from("fffb9004000000000000", "hex")), "mp3")
  assert.equal(musicFileExtension(Buffer.from("0000001c667479704d344120", "hex")), "m4a")
  assert.equal(musicFileExtension(Buffer.alloc(0)), "mp3")
})

test("图片容器类型：按文件头识别 jpg/png/webp/gif", () => {
  assert.equal(imageFileExtension(Buffer.from("ffd8ffe000104a464946", "hex")), "jpg")
  assert.equal(imageFileExtension(Buffer.from("89504e470d0a1a0a", "hex")), "png")
  assert.equal(imageFileExtension(Buffer.from("474946383961", "hex")), "gif")
  assert.equal(imageFileExtension(Buffer.from("524946460000000057454250", "hex")), "webp")
  assert.equal(imageFileExtension(Buffer.alloc(0)), "jpg")
})

test("音乐详情请求地址：携带音乐编号", () => {
  const url = new URL(buildMusicDetailUrl("7700055525899143990"))
  assert.equal(url.host, "www.douyin.com")
  assert.equal(url.pathname, "/aweme/v1/music/detail/")
  assert.equal(url.searchParams.get("music_id"), "7700055525899143990")
  assert.equal(url.searchParams.get("aid"), "6383")
})

test("背景音乐地址：详情缺失时按音乐 mid 查询音乐详情接口", async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    return new Response(
      JSON.stringify({
        status_code: 0,
        music_info: {
          title: "原声",
          play_url: { uri: "", url_list: [] },
          extra: JSON.stringify({ original_song_url: "https://sf26-sign.douyinstatic.com/ies-music-hj/7700055571198167867.mp3?x-expires=1" }),
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  }
  try {
    const url = await fetchMusicUrl({ music: { mid: "7700055525899143990", play_url: { url_list: [] } } })
    assert.equal(url, "https://sf26-sign.douyinstatic.com/ies-music-hj/7700055571198167867.mp3?x-expires=1")
    assert.equal(calls.length, 1)
    assert.match(calls[0].url, /music_id=7700055525899143990/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("背景音乐地址：详情自带地址时不再请求音乐详情接口", async () => {
  const originalFetch = globalThis.fetch
  let called = 0
  globalThis.fetch = async () => {
    called++
    return new Response("{}", { status: 200 })
  }
  try {
    const url = await fetchMusicUrl({
      music: { play_url: { url_list: ["https://sf6-cdn-tos.douyinstatic.com/obj/ies-music/1.mp3"] } },
    })
    assert.equal(url, "https://sf6-cdn-tos.douyinstatic.com/obj/ies-music/1.mp3")
    assert.equal(called, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("背景音乐地址：详情与音乐编号都缺失时返回空", async () => {
  assert.equal(await fetchMusicUrl({}), "")
  assert.equal(await fetchMusicUrl(null), "")
})

test("解析服务调用：POST 携带账号 cookie，失败回退 GET", async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (options.method === "POST") {
      return new Response(
        JSON.stringify({
          code: 0,
          video_url: "https://cdn.example/a.mp4",
          music_url: "https://cdn.example/b.mp3",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      )
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
    assert.equal(result.music, "https://cdn.example/b.mp3")
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

test("匿名 ttwid 注册：解析 set-cookie", async () => {
  resetTtwidCache()
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    return new Response("{}", { status: 200, headers: { "Set-Cookie": "ttwid=tt-123; Path=/" } })
  }
  try {
    const value = await registerAnonymousTtwid()
    assert.equal(value, "tt-123")
    assert.equal(calls.length, 1)
    assert.equal(calls[0].options.method, "POST")
    assert.ok(calls[0].url.includes("ttwid.bytedance.com/ttwid/union/register/"))
  } finally {
    globalThis.fetch = originalFetch
    resetTtwidCache()
  }
})

test("作品详情自动解析：网页 cookie 可用时直接命中", async () => {
  resetTtwidCache()
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
    const detail = await fetchItemInfoDetailAuto("123", "sessionid=abc")
    assert.equal(detail.aweme_id, "123")
    assert.equal(calls.length, 1)
    assert.equal(calls[0].options.headers.Cookie, "sessionid=abc")
  } finally {
    globalThis.fetch = originalFetch
    resetTtwidCache()
  }
})

test("作品详情自动解析：网页 cookie 失效时回退匿名 ttwid", async () => {
  resetTtwidCache()
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (String(url).includes("ttwid.bytedance.com")) {
      return new Response("{}", { status: 200, headers: { "Set-Cookie": "ttwid=tt-456; Path=/" } })
    }
    const cookie = options.headers?.Cookie ?? ""
    if (cookie.includes("ttwid=")) {
      return new Response(JSON.stringify({ status_code: 0, item_list: [{ aweme_id: "123", aweme_type: 2 }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    return new Response(JSON.stringify({ status_code: 8, status_msg: "用户未登录" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }
  try {
    const detail = await fetchItemInfoDetailAuto("123", "sessionid=abc")
    assert.equal(detail.aweme_id, "123")
    assert.equal(calls.length, 3)
    assert.equal(calls[1].options.method, "POST")
    assert.equal(calls[2].options.headers.Cookie, "ttwid=tt-456")
  } finally {
    globalThis.fetch = originalFetch
    resetTtwidCache()
  }
})

test("作品详情自动解析：无 cookie 时直接用匿名 ttwid", async () => {
  resetTtwidCache()
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (String(url).includes("ttwid.bytedance.com")) {
      return new Response("{}", { status: 200, headers: { "Set-Cookie": "ttwid=tt-789; Path=/" } })
    }
    return new Response(JSON.stringify({ status_code: 0, item_list: [{ aweme_id: "456", aweme_type: 4 }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }
  try {
    const detail = await fetchItemInfoDetailAuto("456")
    assert.equal(detail.aweme_id, "456")
    assert.equal(calls.length, 2)
    assert.equal(calls[0].options.method, "POST")
    assert.equal(calls[1].options.headers.Cookie, "ttwid=tt-789")
  } finally {
    globalThis.fetch = originalFetch
    resetTtwidCache()
  }
})

test("作品详情自动解析：两条来源都失败时抛出合并错误", async () => {
  resetTtwidCache()
  const originalFetch = globalThis.fetch
  globalThis.fetch = async url => {
    if (String(url).includes("ttwid.bytedance.com")) {
      return new Response("{}", { status: 200, headers: { "Set-Cookie": "ttwid=tt-000; Path=/" } })
    }
    return new Response(JSON.stringify({ status_code: 8, status_msg: "用户未登录" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }
  try {
    await assert.rejects(() => fetchItemInfoDetailAuto("123", "sessionid=abc"), /网页 cookie.*匿名 ttwid/s)
  } finally {
    globalThis.fetch = originalFetch
    resetTtwidCache()
  }
})

test("作品信息：提取作者、文案与互动数据", () => {
  const meta = pickShareMeta({
    author: { nickname: "忻城公安" },
    desc: "谨防二次诈骗",
    statistics: { play_count: 0, digg_count: 15, comment_count: 218, share_count: 89 },
  })
  assert.equal(meta.author, "忻城公安")
  assert.equal(meta.desc, "谨防二次诈骗")
  assert.equal(meta.digg, 15)
  assert.equal(meta.comment, 218)
  assert.equal(meta.share, 89)
})

test("作品信息字段：支持英文与中文别名并去重", () => {
  assert.deepEqual(parseMetaFields("作者, 点赞，comment"), ["author", "digg", "comment"])
  assert.deepEqual(parseMetaFields("unknown,x"), [])
})

test("计数缩写：万与亿", () => {
  assert.equal(formatCount(999), "999")
  assert.equal(formatCount(12345), "1.2万")
  assert.equal(formatCount(100000000), "1亿")
})

test("作品信息文案：按字段顺序输出且播放量缺失显示未知", () => {
  const text = formatShareMeta(
    { author: "忻城公安", desc: "谨防二次诈骗", play: 0, digg: 15, comment: 0 },
    { fields: "author,desc,play,digg,comment" },
  )
  assert.equal(text, "作者：忻城公安\n简介：谨防二次诈骗\n播放：未知\n点赞：15\n评论：0")
})

test("作品信息文案：自定义模板替换变量并支持换行符", () => {
  const text = formatShareMeta(
    { author: "别了个别", desc: "文案", play: 12000, digg: 813, comment: 218, share: 89 },
    { template: "{author}：{desc}\\n播放 {play}｜点赞 {digg}｜评论 {comment}｜分享 {share}" },
  )
  assert.equal(text, "别了个别：文案\n播放 1.2万｜点赞 813｜评论 218｜分享 89")
})

test("评论列表请求地址：携带作品编号与条数", () => {
  const url = new URL(buildCommentListUrl("7699880911991506879", 5))
  assert.equal(url.host, "www.iesdouyin.com")
  assert.equal(url.pathname, "/web/api/v2/comment/list/")
  assert.equal(url.searchParams.get("aweme_id"), "7699880911991506879")
  assert.equal(url.searchParams.get("count"), "5")
  assert.equal(url.searchParams.get("aid"), "6383")
})

test("热门评论：解析列表并格式化文案", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        comments: [
          { text: "看我有多少台", user: { nickname: "外贸怎么做" }, digg_count: 9 },
          { text: "好家伙", user: { nickname: "路人" }, digg_count: 0 },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  try {
    const comments = await fetchTopComments("7699880911991506879", { count: 2, cookie: "ttwid=abc" })
    assert.equal(comments.length, 2)
    assert.equal(comments[0].user, "外贸怎么做")
    assert.equal(formatComments(comments), "热门评论：\n1. 外贸怎么做：看我有多少台（赞 9）\n2. 路人：好家伙")
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("热门评论：无评论时返回空文案", () => {
  assert.equal(formatComments([]), "")
})
