export function isAccountEnabled(accountEnabled, uid) {
  if (!accountEnabled || typeof accountEnabled !== "object") return true
  return accountEnabled[uid] !== false
}

export function parseAccounts(tokens, accountEnabled) {
  if (!Array.isArray(tokens)) return []
  return tokens
    .map(item => {
      if (item && typeof item === "object") {
        return {
          uid: String(item.uid ?? ""),
          cookie: String(item.cookie ?? ""),
          enabled: item.enabled !== false,
        }
      }
      const text = String(item ?? "")
      const idx = text.indexOf(":")
      const uid = idx > -1 ? text.slice(0, idx) : text
      return {
        uid,
        cookie: idx > -1 ? text.slice(idx + 1) : "",
        enabled: isAccountEnabled(accountEnabled, uid),
      }
    })
    .filter(item => item.uid || item.cookie)
}

export function serializeAccounts(list) {
  const token = []
  const accountEnabled = {}
  if (!Array.isArray(list)) return { token, accountEnabled }
  for (const item of list) {
    const uid = String(item?.uid ?? "").trim()
    const cookie = String(item?.cookie ?? "").trim()
    if (!uid) continue
    token.push(cookie ? `${uid}:${cookie}` : uid)
    if (item?.enabled === false) accountEnabled[uid] = false
  }
  return { token, accountEnabled }
}
