# bilibili-digest

面向哔哩哔哩视频学习的 Chrome 扩展：在侧边栏阅读时间戳字幕、搜索内容、生成 AI 摘要、查看双语翻译和保存本地笔记，同时保留 YouTube 支持。

## 项目来源与致谢

本项目基于 **[Zara Zhang 的 YouTube Digest](https://github.com/zarazhangrui/youtube-digest)** 增强实现，开发基线为提交 [`bb2f7b1aedb6b50c261c0cf35b0acc7ed631d833`](https://github.com/zarazhangrui/youtube-digest/commit/bb2f7b1aedb6b50c261c0cf35b0acc7ed631d833)。

原项目提供 Chrome 侧边栏、YouTube 字幕、DeepSeek 摘要与翻译、本地笔记等基础能力。本项目在此基础上增加 B 站适配，并独立命名为 `bilibili-digest`。保留上游提交历史、原作者版权声明和 [MIT 许可证](LICENSE)，本项目并非哔哩哔哩官方产品。

## 相对原项目的增强

- 支持 B 站普通 BV、av 视频及分 P 页面，提供“视频摘要”和“记笔记”入口。
- 复用播放器的字幕签名请求，校验视频标识与 CID，优先使用人工中文字幕，其次使用自动中文字幕。
- B 站字幕直接从站点读取，不经过 Supadata；只阅读字幕无需 API Key。
- 按平台、视频和分 P 隔离缓存与笔记，拒绝来源不匹配的字幕，并淘汰缺少来源标识的旧 B 站缓存。
- 复用字幕搜索、复制、导出、时间戳跳转、选中文本讲解与笔记功能。
- 增加 B 站 URL、字幕解析、页面消息、请求身份校验和缓存隔离的自动化回归测试。

## 安装

需要 Chrome 116 或更高版本，无需构建。

1. 在[本仓库](https://github.com/jackcooper2015/bilibili-digest)点击 **Code → Download ZIP**，解压到长期保留的文件夹；也可以执行：

   ```sh
   git clone https://github.com/jackcooper2015/bilibili-digest.git
   ```

2. 打开 `chrome://extensions`，开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择直接包含 `manifest.json` 的项目文件夹。
4. 打开 B 站普通视频，等待播放器加载，点击“视频摘要”或扩展图标。
5. 更新代码后，在扩展管理页点击“重新加载”，再刷新视频页面。

安装后保持目录位置不变。移动或删除文件夹会使本地扩展失效，需要从新的位置重新加载。目前采用本地加载方式，不会自动更新。

## 密钥与使用方式

| 功能 | 所需配置 |
| --- | --- |
| B 站字幕、搜索、时间戳跳转、选中字幕保存笔记 | 无需 API Key；部分字幕需要在同一 Chrome 个人资料中登录 B 站 |
| YouTube 原生字幕 | 在设置页填写 Supadata API Key |
| AI 摘要、讲解、翻译、自动整理笔记 | 在设置页填写 DeepSeek API Key |

当前 AI 功能固定使用 `https://api.deepseek.com` 的 `deepseek-v4-flash`，采用非思考模式。密钥请自行填写到扩展设置页，不要写进源码、提交、截图或聊天。Supadata 与 DeepSeek 的服务费用由用户自己的账号承担，本项目不提供 API 额度。

打开侧边栏后可以阅读原文，选择中文或双语视图，通过概览查看章节和重点引用，并保存带时间戳的笔记。中文视频通常直接使用原文视图即可。AI 功能按需调用；播放器下方“记笔记”需要 AI 整理，选中字幕直接保存笔记无需 AI。

完整的登录、字幕请求、权限说明见 [B 站使用说明](docs/哔哩哔哩使用说明.md)。

## 限制与排障

- B 站支持普通视频，不支持番剧、直播、付费或受限内容；无可用字幕轨道、仅有画面内烧录字幕时无法提取。
- 未发现当前视频字幕请求时，等待播放器加载后重试，必要时刷新页面并确认已登录。
- 不下载音频、不提供语音转写，不会用视频简介冒充字幕摘要。
- YouTube 使用 Supadata 原生字幕模式 `mode=native`；Shorts、直播及受限视频可能无法使用。
- B 站接口、登录状态、平台风控和网络变化可能影响字幕读取；扩展不绕过访问限制。
- 当前翻译目标沿用原项目的简体中文；其他浏览器及移动端未验证。

## 隐私

字幕、笔记、缓存和密钥保存在 Chrome 扩展本地存储。B 站请求使用浏览器正常站点登录态，不要求复制 Cookie，也不保存 Cookie 字符串。YouTube 字幕地址发送给 Supadata；使用 AI 时，所需字幕和上下文发送给 DeepSeek。没有开发者服务器、广告或遥测。

详见 [隐私说明](PRIVACY.md)及[安全说明](SECURITY.md)。

## 开发与验证

工程使用原生 JavaScript、HTML 和 CSS。修改后运行：

```sh
npm test
npm run check
npm run package
git diff --check
```

打包结果为 `dist/bilibili-digest-v1.3.0.zip`。发布脚本按白名单打包，并检查语法、引用及常见密钥模式。

自动化检查不能代替真实浏览器和服务验证，已有验证范围与未完成项目见 [测试记录](docs/测试记录.md)。如需自定义 AI 服务，先在编程工具中打开 Chrome 实际加载的本项目文件夹，再使用设置页中的自定义提示词；不要在提示词中包含密钥。

## 许可证

[MIT](LICENSE)。原项目版权归 Zara Zhang 所有，原始许可声明随本项目保留。
