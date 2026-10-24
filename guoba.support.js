import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import YAML from "yaml"
import { DEFAULT_CONFIG } from "./lib/config-default.js"

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
    bottomHelpMessage: "格式 uid:cookie，一行一个账号。扫码登录成功后插件会自动写入，删除某一项则自动断开该账号",
    component: "GTags",
    componentProps: {
      placeholder: "uid:cookie",
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
  await fs.writeFile(CONFIG_FILE, YAML.stringify(config), "utf8")
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
        }
      },
      async setConfigData(data, { Result }) {
        const config = await readConfig()
        for (const [key, value] of Object.entries(data ?? {})) {
          if (!key) continue
          setPath(config, key, value)
        }
        await writeConfig(config)
        return Result.ok({}, "保存成功~")
      },
    },
  }
}
