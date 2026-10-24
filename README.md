<div align="center">

# TRSS-Yunzai DouYin Plugin

TRSS-Yunzai 抖音适配器插件

基于 [douyin.ts](https://github.com/dmmdekkd/douyin.ts) SDK，支持抖音私聊 / 群聊消息收发与事件处理

</div>

## 🐬 安装教程

需要先准备 [TRSS-Yunzai](../../../Yunzai)

<details>
  <summary>展开/收起</summary>

#### 🔧 Yunzai 根目录执行命令安装

推荐使用 git 进行安装，以方便后续使用 `#抖音bot更新` 升级：

```bash
git clone --depth=1 https://github.com/huliaiya/DouYin-Plugin.git ./plugins/DouYin-Plugin
```

> [!NOTE]
> 如果你的网络环境较差，无法连接到 Github，可以使用代理加速下载服务
>
> ```bash
> git clone --depth=1 https://ghproxy.521002.xyz/https://github.com/huliaiya/DouYin-Plugin.git ./plugins/DouYin-Plugin
> ```

#### 🔧 安装依赖

```bash
pnpm install
```

</details>

## 使用教程

- `#抖音bot账号` 查看已登录账号
- `#抖音bot登录` 扫码登录新账号
- `#抖音bot删除uid` 删除账号并断开连接
- `#抖音bot更新` 更新插件（更新成功自动重启）
- `#抖音bot更新日志` 查看插件更新日志

## 配置说明

配置文件 `config/DouYin.yaml`：

- `permission` 指令权限，默认 `master`
- `bot.timeout` 请求超时时间（ms，默认 30000）
- `bot.autoRead` 收到消息后自动标记已读（对方可见已读回执）
- `bot.activeStatus` 上报在线状态（对方可见在线）
- `token` 账号列表，格式 `uid:cookie`
- `mediaHostAllowlist` 媒体下载域名白名单的附加后缀，默认空（仅放行抖音官方 CDN 域名）

令牌变更后无需重启，适配器会定时检测配置变化自动连接新账号、断开删除的账号

## 账号安全与风控

### 登录双重验证（建议关闭）

抖音 App「设置 → 账号与安全 → 登录双重验证」开启后，新设备登录或异常登录会要求二次验证。机器人通过 Cookie 模拟登录，开启双重验证时容易触发风控拦截、登录后强制二次验证，导致掉线或消息收发异常。

**建议关闭双重验证**，保持 Cookie 登录稳定：

![抖音账号与安全-双重验证](docs/account-security.jpg)


### 抖音风控限制

可能出现消息仅回显到自身、对方看不到：

扫码登录若返回 `登录失败：check_qrconnect error_code=7 访问太频繁，请稍后再试`，说明扫码登录接口触发了抖音风控。插件会在原错误后附加风控提示，处理建议：

- 间隔数分钟后再执行登录指令，避免连续重复扫码
- 确认账号已关闭登录双重验证
- 更换网络环境（代理或 IP 被风控时更明显）
- 已在同一设备登录过的账号可直接配置 `token: uid:cookie` 跳过扫码流程

## 安全说明

插件内置的媒体代理会代取抖音 CDN 上的图片、视频等资源，默认启用以下限制：

- **域名白名单**：仅允许 `douyinpic.com`、`douyincdn.com`、`byteimg.cn`、`pstatp.com`、`ixigua.com`、`feoffline.com` 等抖音官方域名及其子域名，非白名单地址直接返回 403
- **逐跳校验**：跟随重定向时对每一跳重新校验目标域名，避免白名单域名跳转至内网地址
- **Cookie 隔离**：账号 Cookie 仅发送至白名单目标，不随任意请求外发
- **资源上限**：单次请求超时 30 秒，响应体超过 64 MB 即中断

如需接入其他 CDN，在 `config/DouYin.yaml` 中配置 `mediaHostAllowlist` 追加域名后缀，例如：

```yaml
mediaHostAllowlist:
  - cdn.example.com
```

此外，Yunzai 自身监听端口（如 2536）应限制在内网或通过反向代理加鉴权访问，避免插件接口被外部直接调用。

## 消息支持

- 收：文本、@、图片（原样透传）、视频（原样透传）、语音（降级文本提示）、文件（原样透传）、表情包、位置、链接/接龙/用户/群邀请等卡片（raw 透传）
- 发：文本、@、@全体成员、图片、视频、文件、表情、位置、raw 卡片透传；不支持的类型自动降级文本（如语音）
- 引用回复：5 分钟内触发消息自动引用，且可引用任意类型消息、回复内容不限于文本（图片 / 视频 / 文件等）；node 合并转发默认渲染为「聊天记录」图片发送（`bot.forwardToImage` 开启，关闭则映射 SDK forward 卡片一次组卡）；合并转发可嵌套，内层聊天记录会递归渲染为内嵌小卡片

> 协议限制：发送位置消息仅自身可见；群聊撤回无权限（对已发送消息生效，转发流程本身不再触发撤回）；关闭转图片后合并转发卡片按节点文本预览渲染，纯生成内容的节点无真实消息 id，点开详情可能无内容

## 事件支持

- message：私聊 / 群聊消息、消息编辑
- notice：消息撤回、表情回应、已读回执、输入状态、好友增减、群成员增减、群名/头像变更、群解散
- request：好友申请、入群申请（approve / reject）
- voip：语音 / 视频来电感知

## 其他框架集成

本插件面向 TRSS-Yunzai 运行时。若你希望在其他框架中使用抖音相关能力，可参考以下项目：

- [zhin-adapter-douyin](https://github.com/zhinjs/zhin-adapter-douyin)（Zhin 框架）
- [karin-plugin-adapter-douyin](https://github.com/dmmdekkd/karin-plugin-adapter-douyin)（Karin 框架）

## 相关链接

- 许可证：MIT（[LICENSE](LICENSE)）
- SDK：https://github.com/dmmdekkd/douyin.ts
- TRSS-Yunzai：https://github.com/TimeRainStarSky/Yunzai
