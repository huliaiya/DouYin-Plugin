export const DEFAULT_CONFIG = {
  permission: "master",
  bot: {
    timeout: 30000,
    autoRead: true,
    activeStatus: true,
    forwardToImage: true,
    shareVideoReply: true,
    shareVideoApi: "https://api.huliaiya.icu/API/douyin.php",
    shareVideoApiToken: "",
  },
  token: [],
  mediaHostAllowlist: [],
  accountEnabled: {},
}

export const CONFIG_TIPS = [
  "欢迎使用 TRSS-Yunzai DouYin Plugin ! SDK：dmmdekkd",
  "参考：https://github.com/dmmdekkd/douyin.ts",
]
