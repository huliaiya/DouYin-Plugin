<div align="center">

# TRSS-Yunzai DouYin Plugin

TRSS-Yunzai 抖音适配器插件

基于 [douyin.ts](https://github.com/dmmdekkd/douyin.ts) SDK，支持抖音私聊 / 群聊消息收发与事件处理

</div>

## 功能特性

- 消息收发：私聊、群聊消息，@、@全体成员、引用回复，5 分钟内自动引用触发消息
- 富媒体发送：图片、视频、文件、表情、位置，支持本地路径、网络地址、base64 与字节流
- 合并转发转图片：node 合并转发默认渲染为「聊天记录」卡片图片，支持嵌套转发
- 事件处理：好友申请、入群申请、撤回、表情回应、已读回执、输入状态、群成员增减、群资料变更、群解散、语音与视频来电
- 多账号挂机：账号列表统一管理，每个账号可单独启用或停用
- 两种加号方式：App 扫码登录、浏览器网页版 cookie 登录（自动识别 UID）
- 可视化配置：自带锅巴面板（Guoba-Plugin-Next）适配文件，无需改动面板代码

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

### 指令列表

| 指令 | 说明 |
| --- | --- |
| `#抖音bot账号` | 查看已登录账号列表（含停用状态） |
| `#抖音bot登录` | 扫码登录新账号，二维码直接发到聊天窗口 |
| `#抖音bot登录cookie <cookie>` | 用网页版 cookie 添加账号（自动识别 UID，无需扫码） |
| `#抖音bot添加cookie <cookie>` | 同上，与 `#抖音bot登录cookie` 等价 |
| `#抖音bot删除<uid>` | 删除指定账号并断开连接 |
| `#抖音bot更新` | 更新插件到最新版本，更新成功自动重启 |
| `#抖音bot更新日志` | 查看插件更新日志 |

指令同时支持英文写法 `#DouYinBot账号`、`#DouYinBot登录` 等（大小写混写均可）。指令权限由配置项 `permission` 控制，默认 `master`。

### 扫码登录

1. 发送 `#抖音bot登录`
2. 插件把登录二维码发到聊天窗口，用抖音 App 扫码确认
3. 连接成功后自动写入账号列表并回复「账号 <uid> 连接成功」

在云崽终端（stdin）里发起扫码登录时，二维码会以字符画打印在终端，同时保存一份 PNG 到 `data/DouYin/qrcode.png`，方便手机扫码。

扫码登录得到的会话绑定服务器侧设备身份（持久化在 `data/DouYin/<uid>/device.json`），重启后复用设备信息，可避免重复注册触发二次验证，也更适合发送图片、视频等需要上传接口的媒体。

### 用网页版 cookie 添加账号

不想扫码时，可从浏览器抖音网页版（已登录）导出 cookie 后直接粘贴，支持三种格式：

- Cookie-Editor 扩展导出的 JSON 数组
- JSON 对象映射（`{"sessionid":"...","ttwid":"..."}`）
- 浏览器复制的 cookie 字符串（`name=value; name=value`，含 `douyin.com` 这类无值标记项也可识别）

操作步骤：

1. 浏览器扩展 Cookie-Editor 打开 `https://www.douyin.com`，导出当前站点 cookie
2. 发送 `#抖音bot登录cookie <完整cookie字符串>`（cookie 需含 `sessionid`，并建议保留 `sid_guard`、`sid_tt`、`ttwid`、`passport_csrf_token`、`s_v_web_id`、`UIFID`、`web_sign_token`）
3. 插件用 cookie 请求抖音资料接口自动识别数字 UID，连接成功后写入账号列表并回复「连接成功」

同一 UID 再次提交会覆盖旧记录；cookie 过期时回复「cookie 校验失败」，重新导出即可。

cookie 属于敏感凭据：聊天指令会把 cookie 原文写进云崽日志，更推荐在锅巴面板的 Cookie 输入框粘贴。

网页版 cookie 与 App 扫码来源不同，风控概率相对更高，抖音「登录双重验证」建议保持关闭。另外，媒体上传走抖音网页接口，网页 cookie 建立 IM 连接后网页会话通常在几分钟内被注销，此时消息收发正常但图片、视频发送会提示「媒体上传凭据获取失败」；需要长期发送媒体请使用扫码登录。

## 配置说明

配置文件 `config/DouYin.yaml`：

- `permission` 指令权限，默认 `master`
- `bot.timeout` 请求超时时间（ms，默认 30000）
- `bot.autoRead` 收到消息后自动标记已读（对方可见已读回执）
- `bot.activeStatus` 上报在线状态（对方可见在线）
- `bot.shareVideoReply` 收到抖音分享作品时自动回传原片视频，默认开启
- `bot.shareVideoApi` 分享作品解析服务地址，默认 `https://api.huliaiya.icu/API/douyin.php`；置空则使用插件内置解析。接口约定：优先 `POST {地址}` body `{"url":作品ID,"cookie":账号Cookie,"token":访问令牌,"type":"json"}`，失败时回退 `GET {地址}?url={作品ID}&type=json`；返回 `{code:0, video_url, urls[]}`。插件会把当前账号的 Cookie 随 POST 请求发送给该解析服务，解析服务无需自行保存 Cookie
- `bot.shareVideoApiToken` 解析服务访问令牌，接口侧启用令牌校验时填写
- `bot.shareVideoCookie` 专用的抖音网页 Cookie，随解析请求发送。抖音桌面端 IM 登录会使同一 cookie 的网页会话失效（接口探测返回 `status_code 8`），解析原片需要一个只在浏览器使用的网页 Cookie
- `token` 账号列表，格式 `uid:cookie`
- `accountEnabled` 账号启用状态映射，值为 `false` 的 UID 处于停用状态（默认全部启用，只记录停用项）
- `mediaHostAllowlist` 媒体下载域名白名单的附加后缀，默认空（仅放行抖音官方 CDN 域名）

令牌变更后无需重启，适配器会定时检测配置变化自动连接新账号、断开删除的账号。会话失效时插件会移除账号并提示重新扫码，重新导出 cookie 后再执行一次 `#抖音bot登录cookie` 即可覆盖同 UID 的旧记录。

### 每账号独立开关

每个账号可以单独启用或停用：

- 启用：账号保持在线，接收到的消息与指令正常响应
- 停用：账号保持在线连接，忽略全部消息、通知与好友/入群申请，插件不会用该账号回复任何内容

停用状态记录在 `accountEnabled` 中，切换后立即生效，无需重启或等待重连。

### 用锅巴面板管理配置

插件自带 [Guoba-Plugin-Next](https://github.com/cchanlan/guoba-plugin-next) 的适配文件 `guoba.support.js`，装上锅巴面板后无需改动面板代码：

- 面板左侧「插件」菜单里会出现 DouYin-Plugin，点进去即可看到「配置」表单
- 可编辑项：账号列表（UID 与 Cookie 分开填写，Cookie 以密码框显示，每个账号带独立启用开关）、上报已读、上报在线状态、合并转发转图片、请求超时、指令权限、媒体域名白名单附加项
- 账号列表扫码登录成功后由插件自动写入；在面板删除某一项，适配器会自动断开该账号
- 关闭某账号的启用开关后，该账号保持在线但不再响应消息与指令，多账号同时挂机时可用来避免重复回复
- 保存后插件自动热加载，约 5 秒内生效，无需重启云崽

添加账号也可以在面板的账号列表里粘贴 `uid:cookie`，或在 Cookie 输入框直接粘贴网页版 cookie（支持 Cookie-Editor JSON 与浏览器复制的 cookie 字符串，UID 留空会自动识别），或直接用 `#抖音bot登录` 扫码登录。

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

网页版 cookie 会话绑定浏览器 IP 与设备指纹，复制到服务器使用属于异地登录，抖音会在短时间内注销该网页会话：表现是消息收发仍可用，但媒体上传接口返回「用户未登录」，图片、视频发不出去。出现这种情况直接重新导出 cookie，或改用扫码登录。

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

## 常见问题

- 图片、视频发不出去，日志提示「媒体上传凭据获取失败」：登录态已失效或触发风控，执行 `#抖音bot登录` 重新扫码
- 账号突然掉线、日志提示「cookie 校验失败」：该会话已被抖音注销，重新导出网页版 cookie 或扫码登录即可
- 扫码提示「访问太频繁」：抖音扫码接口风控，间隔几分钟再试，或改用网页版 cookie 加号
- 群里只有自己能收到机器人消息：抖音消息回显限制，检查账号是否被限流或处于风控状态
- 想让多账号挂机但只用一个回复：用每账号独立开关停用其余账号

## 相关链接

- 许可证：MIT（[LICENSE](LICENSE)）
- TRSS-Yunzai：https://github.com/TimeRainStarSky/Yunzai
