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
import { fileURLToPath } from "node:url"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"

// 锚定 Bot 根目录而非 process.cwd()，避免 Bot 以非根目录方式启动时
// 写错 config/DouYin.yaml 与 data/DouYin/connects.json 的路径。
// guoba.support.js 正常位于 plugins/DouYin/ 下（根标志 lib/plugins、config 在其上两级）；
// 从自身目录逐级向上找带 lib/plugins 或 config 的目录，找不到则退到上两级，再退到 cwd。
const __dirname = path.dirname(fileURLToPath(import.meta.url))
function resolveBotRoot() {
  let dir = __dirname
  for (let up = 0; up < 6; up++) {
    if (existsSync(path.join(dir, "lib", "plugins", "config.js")) || existsSync(path.join(dir, "config")))
      return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.resolve(__dirname, "..", "..")
}
const botRoot = resolveBotRoot()
const pluginName = "DouYin"
const cfgDir = path.join(botRoot, "config")
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

function loadConnects() {
  try {
    const obj = JSON.parse(readFileSync(path.join(botRoot, "data", "DouYin", "connects.json"), "utf8"))
    return new Map(Object.entries(obj))
  } catch {
    return new Map()
  }
}

// token 在 DouYin.yaml 里始终是 "uid:cookie" 字符串数组（index.js 的 30s 热重载与 makeConfig 都按此读取）；
// 锅巴面板展示时拆成 { uid, cookie } 对象行，保存时拼回字符串，双向兼容旧数据
function tokenStrToRows(strs) {
  return (Array.isArray(strs) ? strs : []).map(raw => {
    const s = String(raw ?? "").trim()
    const idx = s.indexOf(":")
    return {
      uid: idx > 0 ? s.slice(0, idx) : "",
      cookie: idx > 0 ? s.slice(idx + 1) : s,
    }
  })
}

function tokenRowsToStr(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter(r => r && (r.uid || r.cookie))
    .map(r => {
      const uid = String(r.uid ?? "").trim()
      const cookie = String(r.cookie ?? "").trim()
      if (!uid) return null
      return cookie ? `${uid}:${cookie}` : uid
    })
    .filter(Boolean)
}

function withStatus(rows) {
  const connects = loadConnects()
  return rows.map(r => ({
    ...r,
    connected: connects.get(r.uid)?.connected ?? false,
  }))
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
    // 面板侧统一用对象行；yaml 里存的是 "uid:cookie" 字符串数组，这里做拆分
    tokenRows: tokenStrToRows(Array.isArray(cfg.token) ? cfg.token : []),
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
          bottomHelpMessage: "单次 SDK 请求的最长等待时间，默认 30000；留空保存时按默认 30000 处理",
          component: "InputNumber",
          defaultValue: 30000,
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
          field: "tokenRows",
          label: "账号列表",
          helpMessage:
            "表格展示所有账号，每行可编辑 / 删除；点「新增」打开弹窗填写 uid 与 cookie。cookie 列默认打码，点编辑可展开查看或修改。",
          bottomHelpMessage:
            "保存后重启 Bot 生效（支持热重载的核心版本 30s 内自动重连）",
          component: "GSubForm",
          componentProps: {
            multiple: true,
            modalProps: { title: "账号" },
            schemas: [
              {
                field: "uid",
                label: "uid",
                helpMessage: "账号数字 id，即 token 中 `:` 之前的部分",
                component: "Input",
                required: true,
                componentProps: { placeholder: "7303940934954584578" },
              },
              {
                field: "cookie",
                label: "cookie",
                helpMessage: "完整登录凭据（sessionid、ttwid、passport_csrf_token 等参数拼接）",
                component: "InputPassword",
                required: true,
                componentProps: { placeholder: "sessionid=xxx; ttwid=xxx; ..." },
              },
            ],
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
          // 面板侧 token 是对象数组；连接状态从 connects.json 实时读取并附加到每行
          tokenRows: withStatus(cfg.tokenRows),
        }
      },
      setConfigData(data, { Result }) {
        const cfg = withDefaults(loadCfg())
        cfg.permission = data.permission ?? cfg.permission
        const timeout = Number(data["bot.timeout"])
        cfg.bot.timeout = Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULTS.bot.timeout
        cfg.bot.autoRead = data["bot.autoRead"] ?? cfg.bot.autoRead
        cfg.bot.activeStatus = data["bot.activeStatus"] ?? cfg.bot.activeStatus
        cfg.bot.forwardToImage = data["bot.forwardToImage"] ?? cfg.bot.forwardToImage
        // 面板侧 tokenRows（对象）→ 写回 yaml 的 token（"uid:cookie" 字符串数组），
        // 同时剔除面板附加的 connected 状态字段
        cfg.token = tokenRowsToStr(
          (Array.isArray(data.tokenRows) ? data.tokenRows : []).map(r => ({
            uid: r.uid,
            cookie: r.cookie,
          })),
        )
        saveCfg(cfg)
        return Result.ok({}, "保存成功~ 配置下次重启 Bot 时加载生效；token 变更在支持热重载的核心版本下 30s 内自动重连")
      },
    },
  }
}
