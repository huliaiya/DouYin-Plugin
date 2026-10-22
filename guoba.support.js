// 锅巴面板（guoba-plugin-next / TRSS-Yunzai guoba.support.js 协议）适配：
// 把本插件 makeConfig("DouYin", ...) 生成的 config/DouYin.yaml 暴露给锅巴 GUI。
//
// 生效机制说明（如实标注，避免用户误以为即时生效）：
//  - permission / bot.* 字段：TRSS-Yunzai 核心在插件加载时一次性 makeConfig 读取，
//    锅巴保存后写回 yaml，需重启 Bot 才重新加载生效。
//  - token 字段：index.js:1874 有 30s 定时器对比 config.token 自动增删账号，
//    但该定时器比较的是 makeConfig 返回的内存 config 对象，只有当 TRSS-Yunzai 核心
//    的 makeConfig 实现支持热重载（下次访问时重读 yaml）时，锅巴保存才即时生效；
//    否则同样需重启 Bot。文案统一标注"保存后重启 Bot 或等待热重载"。

import path from "node:path"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"

const pluginName = "DouYin"
const cfgDir = path.join(process.cwd(), "config")
const cfgFile = path.join(cfgDir, `${pluginName}.yaml`)

// ---- 容错解析 YAML：优先用 yaml，回退 js-yaml，再回退极简内置解析器 ----
let YAMLMod = null
try {
  YAMLMod = await import("yaml")
} catch {
  try {
    YAMLMod = await import("js-yaml").then(m => ({
      parse: s => m.parse(s),
      stringify: o => m.stringify(o),
    }))
  } catch {
    YAMLMod = null
  }
}

// 极简 YAML 解析：覆盖 makeConfig 生成的 DouYin.yaml 的固定结构
// （permission/tips 为标量，bot.* 为嵌套对象，token 为标量或"uid:cookie" 形式数组）
// 支持 js-yaml 写回的带缩进嵌套形式。
function minimalYamlParse(src) {
  const out = { bot: {} }
  const lines = src.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim() || line.trim().startsWith("#")) {
      i++
      continue
    }
    const m = line.match(/^(\s*)([A-Za-z_][\w]*):\s*(.*)$/)
    if (!m) {
      i++
      continue
    }
    const indent = m[1].length
    const key = m[2]
    let rawVal = m[3]
    // 处理数组行（- "item"）
    if (line.trimStart().startsWith("-")) {
      // 上一行应是某 key:（空值）→ 收集兄弟 "-" 行成数组
      // 这里简化：向上找最近有 key 的行，把同缩进的 "- " 都收进去
      // 由于我们已经逐行扫描，遇到 "-" 行直接附加到当前父级 key 上
      // 用一个 pendingKey 追踪（下面逻辑）
    }
    if (rawVal === "") {
      // 可能是嵌套对象或数组起始，看后续行
      const nextNonEmpty = lines.slice(i + 1).find(l => l.trim() && !l.trim().startsWith("#"))
      const nextIndent = nextNonEmpty ? nextNonEmpty.match(/^(\s*)/)[1].length : -1
      const nextIsArrayItem = nextNonEmpty?.trimStart().startsWith("-")
      if (nextIndent > indent || nextIsArrayItem) {
        // 收集子项直到缩进回到 <= 当前
        if (nextIsArrayItem) {
          const arr = []
          let j = i + 1
          while (j < lines.length) {
            const l = lines[j]
            if (!l.trim() || l.trim().startsWith("#")) { j++; continue }
            const im = l.match(/^(\s*)-?\s*$/)
            const item = l.match(/^(\s*)-\s*["']?([^"']+)["']?\s*$/)
            if (item && item[1].length > indent) {
              arr.push(item[2].trim())
              j++
              continue
            }
            break
          }
          out[key] = arr
          i = j
          continue
        } else {
          // 嵌套对象（本插件只有 bot）
          const sub = {}
          let j = i + 1
          while (j < lines.length) {
            const l = lines[j]
            const im = l.match(/^(\s*)([A-Za-z_][\w]*):\s*(.*)$/)
            if (!im) { j++; continue }
            if (im[1].length <= indent) break
            sub[im[2]] = coerceScalar(im[3])
            j++
          }
          out[key] = sub
          i = j
          continue
        }
      } else {
        out[key] = coerceScalar("")
        i++
        continue
      }
    }
    // 行内数组 ["a","b"]
    if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
      out[key] = rawVal.slice(1, -1).split(",").map(s => coerceScalar(s.trim())).filter(v => v !== null && v !== undefined)
      i++
      continue
    }
    out[key] = coerceScalar(rawVal)
    i++
  }
  return out
}

function coerceScalar(raw) {
  let val = raw.replace(/^["']|["']\s*$/g, "").trim()
  if (val === "") return undefined
  if (val === "true") return true
  if (val === "false") return false
  if (/^-?\d+$/.test(val)) return Number(val)
  if (/^-?\d+\.\d+$/.test(val)) return Number(val)
  return val
}

function minimalYamlStringify(obj) {
  const lines = []
  if (typeof obj.tips === "string") lines.push(`tips: ${JSON.stringify(obj.tips)}`)
  if (obj.permission !== undefined) lines.push(`permission: ${JSON.stringify(obj.permission)}`)
  if (obj.bot) {
    lines.push("bot:")
    for (const [k, v] of Object.entries(obj.bot)) {
      lines.push(`  ${k}: ${JSON.stringify(v)}`)
    }
  }
  if (Array.isArray(obj.token)) {
    lines.push("token:")
    for (const t of obj.token) lines.push(`  - ${JSON.stringify(t)}`)
  }
  return lines.join("\n") + "\n"
}

function parseYaml(src) {
  if (YAMLMod && YAMLMod.parse) {
    try {
      return YAMLMod.parse(src) || {}
    } catch {
      // fall through
    }
  }
  return minimalYamlParse(src)
}

function stringifyYaml(obj) {
  if (YAMLMod && YAMLMod.stringify) {
    try {
      return YAMLMod.stringify(obj)
    } catch {
      // fall through
    }
  }
  return minimalYamlStringify(obj)
}

function loadCfg() {
  if (!existsSync(cfgFile)) return {}
  return parseYaml(readFileSync(cfgFile, "utf8")) || {}
}

function saveCfg(obj) {
  mkdirSync(cfgDir, { recursive: true })
  writeFileSync(cfgFile, stringifyYaml(obj))
  logger.info(`[DouYin] 锅巴面板已保存 ${pluginName}.yaml，permission=${obj.permission ?? ""} timeout=${obj.bot?.timeout ?? ""}ms token=${obj.token?.length ?? 0}个`)
}

const DEFAULTS = {
  tips: "",
  permission: "master",
  bot: { timeout: 30000, autoRead: true, activeStatus: true, forwardToImage: true },
  token: [],
}

function withDefaults(cfg) {
  return {
    tips: cfg.tips ?? DEFAULTS.tips,
    permission: cfg.permission ?? DEFAULTS.permission,
    bot: { ...DEFAULTS.bot, ...(cfg.bot || {}) },
    token: Array.isArray(cfg.token) ? cfg.token : [],
  }
}

export function supportGuoba() {
  return {
    pluginInfo: {
      name: pluginName,
      title: "DouYin 适配器",
      description: "TRSS-Yunzai 抖音私聊 / 群聊消息收发与事件处理（基于 douyin.ts）",
      author: "dmmdekkd",
      authorLink: "https://github.com/dmmdekkd/douyin.ts",
      link: "https://github.com/dmmdekkd/DouYin-Plugin",
      isV3: true,
      isV2: false,
      showInMenu: "auto",
      icon: "mdi:video",
      iconColor: "#fe2c55",
    },
    configInfo: {
      schemas: [
        {
          label: "基础设置",
          component: "SOFT_GROUP_BEGIN",
        },
        {
          field: "permission",
          label: "指令权限",
          helpMessage: "`#抖音bot*` 指令的触发权限",
          bottomHelpMessage: "保存后需重启 Bot 生效",
          component: "Select",
          required: true,
          componentProps: {
            options: [
              { label: "主人（master）", value: "master" },
              { label: "管理员（admin）", value: "admin" },
              { label: "所有人（all）", value: "all" },
            ],
          },
        },
        {
          label: "Bot 行为",
          component: "SOFT_GROUP_BEGIN",
        },
        {
          field: "bot.timeout",
          label: "请求超时（ms）",
          bottomHelpMessage: "单次 SDK 请求的最长等待时间，默认 30000",
          component: "InputNumber",
          required: true,
          componentProps: { min: 1000, max: 300000 },
        },
        {
          field: "bot.autoRead",
          label: "自动标记已读",
          helpMessage: "收到消息后自动回执，对方可见已读状态",
          bottomHelpMessage: "保存后需重启 Bot 生效",
          component: "Switch",
        },
        {
          field: "bot.activeStatus",
          label: "上报在线状态",
          helpMessage: "在线时对方可见在线（状态点）",
          bottomHelpMessage: "保存后需重启 Bot 生效",
          component: "Switch",
        },
        {
          field: "bot.forwardToImage",
          label: "合并转发渲染为图片",
          helpMessage: "开启时合并转发渲染成「聊天记录」卡片图片发送（更稳定），关闭则走 SDK 原生 forward 卡片",
          bottomHelpMessage: "渲染失败自动回退原生卡片；保存后需重启 Bot 生效",
          component: "Switch",
        },
        {
          label: "账号管理",
          component: "SOFT_GROUP_BEGIN",
        },
        {
          field: "token",
          label: "账号列表（uid:cookie）",
          helpMessage: "每行一个账号，格式 `uid:cookie`",
          bottomHelpMessage: "保存后重启 Bot 生效（部分核心版本支持 yaml 热重载可即时生效）；cookie 失效会自动移除并提示重新扫码",
          component: "InputTextArea",
          componentProps: {
            placeholder: "每行一个，例如：\n7303940934954584578:sessionid=xxx;...",
            rows: 4,
          },
        },
      ],
      getConfigData() {
        const cfg = withDefaults(loadCfg())
        return {
          permission: cfg.permission,
          "bot.timeout": cfg.bot.timeout,
          "bot.autoRead": cfg.bot.autoRead,
          "bot.activeStatus": cfg.bot.activeStatus,
          "bot.forwardToImage": cfg.bot.forwardToImage,
          token: Array.isArray(cfg.token) ? cfg.token.join("\n") : "",
        }
      },
      setConfigData(data, { Result }) {
        const cfg = withDefaults(loadCfg())
        cfg.permission = data.permission ?? cfg.permission
        cfg.bot.timeout = Number(data["bot.timeout"] ?? cfg.bot.timeout)
        cfg.bot.autoRead = data["bot.autoRead"] ?? cfg.bot.autoRead
        cfg.bot.activeStatus = data["bot.activeStatus"] ?? cfg.bot.activeStatus
        cfg.bot.forwardToImage = data["bot.forwardToImage"] ?? cfg.bot.forwardToImage
        const rawTokens = String(data.token ?? "").trim()
        cfg.token = rawTokens
          ? rawTokens
              .split("\n")
              .map(s => s.trim())
              .filter(s => s && s.includes(":"))
          : []
        saveCfg(cfg)
        return Result.ok({}, "保存成功~ 配置下次重启 Bot 时加载生效；token 变更在支持热重载的核心版本下 30s 内自动重连")
      },
    },
  }
}
