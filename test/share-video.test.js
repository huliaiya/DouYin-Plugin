import test from "node:test"
import assert from "node:assert/strict"
import { pickVideoUrls } from "../lib/share-video.js"

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
