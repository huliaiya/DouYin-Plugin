import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import YAML from "yaml"
import { DEFAULT_CONFIG } from "./lib/config-default.js"
import { parseAccounts, serializeAccounts } from "./lib/account.js"
import { parseCookieInput, hasCookiePairs, resolveWebAccount } from "./lib/cookie-login.js"

const PLUGIN_ROOT = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_FILE = path.resolve(PLUGIN_ROOT, "../../config/DouYin.yaml")

const SCHEMAS = [
  {
    label: "账号",
    component: "SOFT_GROUP_BEGIN",
  },
  {
    field: "token",
    label: "账号列表",
    bottomHelpMessage:
      "每个账号填写 UID 与 Cookie 两项，点击行内「编辑」修改。UID 可留空，留空时插件用 Cookie 自动识别。Cookie 可直接粘贴 Cookie-Editor 导出的 JSON 或普通 cookie 字符串。扫码登录成功后插件会自动写入，删除某一条会断开该账号",
    component: "GSubForm",
    componentProps: {
      multiple: true,
      modalProps: {
        title: "账号",
      },
      schemas: [
        {
          field: "uid",
          label: "UID",
          bottomHelpMessage: "抖音账号 UID，可留空由插件根据 Cookie 自动识别",
          component: "Input",
          componentProps: {
            placeholder: "留空自动识别",
          },
        },
        {
          field: "enabled",
          label: "启用",
          bottomHelpMessage: "关闭后该账号不响应任何消息与指令，只保持在线",
          component: "Switch",
          defaultValue: true,
        },
        {
          field: "cookie",
          label: "Cookie",
          bottomHelpMessage:
            "该 UID 对应的登录 cookie，支持 Cookie-Editor 导出的 JSON 数组、JSON 对象或 name=value; name=value 字符串",
          component: "InputPassword",
          componentProps: {
            placeholder: "账号 cookie 或 Cookie-Editor 导出内容",
          },
        },
      ],
    },
  },
  {
    label: "消息行为",
    component: "SOFT_GROUP_BEGIN",
  },
  {
    field: "bot.autoRead",
    label: "上报已读",
    bottomHelpMessage: "收到消息后自动标记已读（对方可见已读回执）",
    component: "Switch",
  },
  {
    field: "bot.activeStatus",
    label: "上报在线状态",
    bottomHelpMessage: "上报在线状态（对方可见在线）",
    component: "Switch",
  },
  {
    field: "bot.forwardToImage",
    label: "合并转发转图片",
    bottomHelpMessage: "把合并转发渲染为聊天记录图片发送，关闭则发送原生 forward 卡片",
    component: "Switch",
  },
  {
    field: "bot.timeout",
    label: "请求超时（毫秒）",
    bottomHelpMessage: "调用抖音接口的超时时间，默认 30000",
    component: "InputNumber",
    componentProps: {
      min: 1000,
      max: 300000,
      step: 1000,
      placeholder: "30000",
    },
  },
  {
    label: "分享作品原片",
    component: "SOFT_GROUP_BEGIN",
  },
  {
    field: "bot.shareVideoReply",
    label: "收到分享作品回传原片",
    bottomHelpMessage: "私聊收到抖音分享作品时，解析原片并以视频消息回传",
    component: "Switch",
  },
  {
    field: "bot.shareVideoMusic",
    label: "附带背景音乐",
    bottomHelpMessage: "回传原片或图片时，额外把作品背景音乐以 mp3/m4a 文件发出",
    component: "Switch",
  },
  {
    field: "bot.shareVideoImageFile",
    label: "图片同时发附件",
    bottomHelpMessage: "图文作品的图片除图片消息外再发一份图片附件，图片消息被审核或客户端不展示时用附件取原图",
    component: "Switch",
  },
  {
    field: "bot.shareVideoMeta",
    label: "附带作品信息",
    bottomHelpMessage: "回传原片前附带作者、简介、播放、点赞、评论数等信息",
    component: "Switch",
  },
  {
    field: "bot.shareVideoMetaFields",
    label: "作品信息字段",
    bottomHelpMessage:
      "逗号分隔的展示字段与顺序，可用 author 作者、desc 简介、play 播放、digg 点赞、comment 评论、share 分享、collect 收藏",
    component: "Input",
    componentProps: {
      placeholder: "author,desc,play,digg,comment",
    },
  },
  {
    field: "bot.shareVideoMetaTemplate",
    label: "作品信息模板",
    bottomHelpMessage:
      "自定义文案模板，变量 {author} {desc} {play} {digg} {comment} {share} {collect}，换行写 \\n；留空使用默认格式",
    component: "Input",
    componentProps: {
      placeholder: "{author}：{desc}\\n播放 {play}｜点赞 {digg}｜评论 {comment}",
    },
  },
  {
    field: "bot.shareVideoComments",
    label: "附带热门评论",
    bottomHelpMessage: "在作品信息后追加作品热门评论内容",
    component: "Switch",
  },
  {
    field: "bot.shareVideoCommentCount",
    label: "热门评论条数",
    bottomHelpMessage: "热门评论条数，1-20",
    component: "Input",
    componentProps: {
      placeholder: "3",
    },
  },
  {
    field: "bot.shareVideoCookie",
    label: "解析用网页 Cookie",
    bottomHelpMessage:
      "仅在浏览器登录的抖音网页 Cookie，用于解析作品详情。机器人扫码登录得到的是 IM 会话，网页接口不认该会话；这份 Cookie 不要用于机器人登录",
    component: "InputPassword",
    componentProps: {
      placeholder: "浏览器 DouYin 网页 cookie 字符串",
    },
  },
  {
    field: "bot.shareVideoApi",
    label: "解析服务地址",
    bottomHelpMessage: "外部解析服务地址，留空则只用内置解析。插件会把上面这份 Cookie 随请求发送给该服务",
    component: "Input",
    componentProps: {
      placeholder: "https://api.example.com/douyin.php",
    },
  },
  {
    field: "bot.shareVideoApiToken",
    label: "解析服务令牌",
    bottomHelpMessage: "解析服务启用访问令牌校验时填写",
    component: "InputPassword",
    componentProps: {
      placeholder: "留空表示不校验",
    },
  },
  {
    label: "权限与安全",
    component: "SOFT_GROUP_BEGIN",
  },
  {
    field: "permission",
    label: "指令权限",
    bottomHelpMessage: "master 为仅主人可用，也可用 admin、all 等",
    component: "Input",
    componentProps: {
      placeholder: "master",
    },
  },
  {
    field: "mediaHostAllowlist",
    label: "媒体域名白名单附加项",
    bottomHelpMessage: "追加允许访问的媒体域名后缀，抖音官方 CDN 已在插件内置白名单",
    component: "GTags",
    componentProps: {
      placeholder: "cdn.example.com",
    },
  },
]

function setPath(target, keyPath, value) {
  const parts = String(keyPath).split(".")
  let cursor = target
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cursor[parts[i]] !== "object" || cursor[parts[i]] === null) cursor[parts[i]] = {}
    cursor = cursor[parts[i]]
  }
  cursor[parts[parts.length - 1]] = value
}

function parseTokenList(tokens, accountEnabled) {
  return parseAccounts(tokens, accountEnabled)
}

async function readConfig() {
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf8")
    const parsed = YAML.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

async function writeConfig(config) {
  await fs.writeFile(CONFIG_FILE, YAML.stringify(config, { lineWidth: 0 }), "utf8")
}

export function supportGuoba() {
  return {
    pluginInfo: {
      name: "DouYin-Plugin",
      title: "DouYin-Plugin",
      description: "TRSS-Yunzai 抖音适配器插件",
      author: "huliaiya",
      authorLink: "https://github.com/huliaiya",
      link: "https://github.com/huliaiya/DouYin-Plugin",
      isV3: true,
      isV2: false,
      showInMenu: "auto",
      icon: "mdi:music-note-eighth",
      iconColor: "#25F4EE",
    },
    configInfo: {
      schemas: SCHEMAS,
      async getConfigData() {
        const config = await readConfig()
        return {
          ...structuredClone(DEFAULT_CONFIG),
          ...config,
          bot: { ...DEFAULT_CONFIG.bot, ...(config.bot ?? {}) },
          token: parseTokenList(config.token, config.accountEnabled),
        }
      },
      async setConfigData(data, { Result }) {
        const config = await readConfig()
        for (const [key, value] of Object.entries(data ?? {})) {
          if (!key) continue
          if (key === "token") {
            const accounts = []
            for (const item of Array.isArray(value) ? value : []) {
              const cookie = parseCookieInput(item?.cookie)
              if (!hasCookiePairs(cookie)) continue
              let uid = String(item?.uid ?? "").trim()
              if (!uid) {
                try {
                  const resolved = await resolveWebAccount(cookie)
                  uid = resolved.uid
                } catch (err) {
                  return Result.error(`账号添加失败：${err.message || err}`, 400)
                }
              }
              accounts.push({ uid, cookie, enabled: item?.enabled !== false })
            }
            const serialized = serializeAccounts(accounts)
            setPath(config, "token", serialized.token)
            setPath(config, "accountEnabled", serialized.accountEnabled)
            continue
          }
          setPath(config, key, value)
        }
        await writeConfig(config)
        return Result.ok({}, "保存成功~")
      },
    },
  }
}
