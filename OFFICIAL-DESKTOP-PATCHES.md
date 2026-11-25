# Official Desktop patch ledger

本仓库从 `upstream.json` 固定的 DeepSeek Harness tag 生成一个临时官方 checkout。`patches/` 是唯一的 OwnDsh 发行接缝；不要直接修改 `.build/official-harness`，发行修改必须由构建脚本重现。

`patches/patches.test.mjs` 在每次运行时对沙箱副本施加全部补丁并断言每条接缝；官方升级改动了任何锚点上下文时会立即失败，不要放宽断言。

`apply.mjs` 的 L3 头部遵循目标文件语法：批处理使用 `@rem`，Shell、PowerShell 和 `.env` 使用 `#`，其余源码保留块注释；shebang 与 `@echo off` 保持首行，多补丁标记合并到单个头部。`apply.test.mjs` 验证头部折叠与旧头部迁移，并在目标平台运行无害的脚本夹具，防止注释被当作命令执行。

rc.5 已提供 macOS ARM64/x64 的官方 `package:mac:*:unsigned` 入口，OwnDsh 直接复用；正式打包调用官方 `build:official`，其中 Client `tsc` 已覆盖账号菜单。接缝测试不替代类型检查。

## rc.5 升级接缝

当前构建锁定官方 Harness `dsh-v0.2.2-rc.5`（`9c2670d3bce5275e0d1610272958121af87787bb`），预置 `owndsh-plugin@0.1.0-beta.23`，用于修复打开大历史会话时的远程工作区断线。

rc.5 首次发行目标为 `dsh-v0.2.2-rc.5`，commit `9c2670d3bce5275e0d1610272958121af87787bb`，预置 `owndsh-plugin@0.1.0-beta.22`。rc.3 至 rc.5 的 Desktop、desktop-host、侧栏品牌和账号菜单仅修改 package 版本，现有补丁保留；更新后精确锁的本机接缝测试通过，Windows x64、macOS ARM64/x64 的 GitHub 构建与正式 Release 全部成功。正式 ARM64 ZIP 的 DSH/插件版本、随包插件内容、deep/strict 签名、真实企业登录、Atria-Dawn 和重启恢复通过；双架构 macOS 与 Windows 更新 feed 的实际大小和 SHA-512 通过，latest/download 返回对应 feed。本轮未复验旧版原地更新、Windows/Intel 交互或 NAS。验收记录见 [OwnDsh rc.5 报告](https://github.com/boe1900/owndsh/blob/main/docs/dsh-022-rc5-compatibility-20261119.md)。

## Desktop 远端页面启动

远端 view 的 HTML 已由 Host 完成模块注入。官方 Web 入口仍能发现 Desktop preload，异步获取 IPC 后再次注入会替换全局模块 loader，使先启动的模块系统收不到后续注册。`OWNDSH-REMOTE-WORKSPACE` 在 `entry.run()` 前为远端页面设置独立启动 gate，等待原 Host 装配和 Desktop IPC 两者完成，保持同一套模块系统。

远端页面只从 Desktop IPC 获取可信 `streamBaseUrl`，在验证 view 的 UUID 路径后补上当前 mount，并设置 `ownsHost: false`。它不重复执行 injections，启动失败也不调用外壳的 fatal 入口。本机根页保持官方单次注入和 `ownsHost: true`，普通 HTTP 页面继续使用 Host 的装配流程。`web-boot-check.mjs` 执行真实官方入口，覆盖 IPC 延迟与拒绝、Host gate 延迟与缺失、非法路径、同步页面失败、本机根页及普通 HTTP 页面。

修复于 2026-11-20 随 [v0.2.2-rc.5.20261120.1](https://github.com/boe1900/owndsh-desktop/releases/tag/v0.2.2-rc.5.20261120.1) 发布，官方版本和预置插件锁保持不变。回归 29 项通过、2 项平台测试跳过。三平台构建及官方随包验收见 [Actions 44700489374](https://github.com/boe1900/owndsh-desktop/actions/runs/44700489374)。Intel 首轮在随包 XLSX 转换时触发 LibreOffice 超时，重跑失败任务后完整通过，未修改或跳过验收。

未经改写的正式 ARM64 ZIP 已核对 Release SHA-256，并在隔离 profile 连接独立 rc.5 Host。远端页面正常装配，模块 facade 只安装一次，实际 WebSocket 保留 view 前缀并收发消息；会话列表、远端独有文件读取和终端工作目录均返回目标 Host 的结果，本机会话列表不含目标会话。两端更新清单与 latest 一致，下载地址固定到本次标签。Windows 和 Intel 已通过各自原生 CI 及随包验收，本轮未在这两个平台执行桌面远控交互验收，也未复验旧版本原地自动安装更新。原生网站 provider 的 503 仍属于现有远端接口准入范围，不计为本次启动故障。

## rc.3 升级接缝

目标锁为 `dsh-v0.2.2-rc.3`、commit `38a6a5c965aa99ab525161efb7cc5cf1fe62fced`。官方增加八语言 `CFBundleLocalizations` 和桌面菜单，品牌补丁保留本地化并替换全部八语言产品名。Windows 安装器文案改由 `installer-locales.mjs` 从 JSON 生成，补丁迁移到官方解析器，保留语言、格式占位符和键校验。macOS 打包新增第二条 App 路径，仍逐项断言。账号菜单由奖励通知字段改为 `renderSlot`，OwnDsh 保留官方通知注入。example appId 变成 `com.deepseek.dsh`，OwnDsh 继续固定自己的 `com.owndsh.desktop`。

数据隔离补丁尊重 Electron 显式 `--user-data-dir`，默认仍为 OwnDsh 独立目录。这样安装包验收可使用隔离数据而不访问用户现有 Chromium 状态。

左上角侧栏复用官方 `ui-brand-official` 的 `OfficialBrandMark` 和 `OfficialBrandName`。unsigned 流水线仍使用真实的 `local` 构建记录，补丁仅删除这两个 slot 注册前的 profile 限制，让侧栏与 DSH 正式版相同，不再使用“DSH 本地构建”和带 `dirty` 的版本回退显示。窗口标题、安装器、图标、菜单、登录、数据目录、签名和更新源继续使用现有 OwnDsh 配置。

## 新增补丁

1. 在 `patches/` 建一个文件，用 `apply.mjs` 的 `applyPatch` 施加（锚点默认恰好一次，重复文本显式声明命中次数）。
2. 在 `patches/index.mjs` 的 `applyPatches` 登记一行。
3. 在下面台账加一行，写清目的与升级检查。

## 设计原则

**发行边界涵盖登录、插件、品牌、数据隔离、公开发行服务和远端页面启动。** 不复制官方源码；名称、图标、appId、外部协议、数据根目录、更新源、账号菜单和启动协调由补丁重现，官方升级时用断言暴露接缝变化。

## 当前接缝

| 标记 | 官方文件 | 目的 | 升级检查 |
| --- | --- | --- | --- |
| `OWNDSH-PATCH-LOGIN-GATE` | `apps/desktop/src/welcome-api.ts` | `needsWelcome()` 恒返回 `false`，官方原生欢迎窗口永不弹出；登录完全交给 OwnDsh 插件的 `shell.overlay` 门禁。 | 检查官方仍把欢迎判定收敛在这个单一函数。 |
| `OWNDSH-PATCH-LOGIN-GATE` | `apps/desktop/src/main.ts` | 掐断账号登出与会话过期两处重新弹欢迎窗口的回路。 | 检查 `previousAccountStatus` 与 `pendingWelcomeNotice` 的回调结构。 |
| `OWNDSH-PATCH-PROFILE-SEED` | `apps/desktop/src/project-manager.ts` | 首次创建 profile 时只写入 `owndsh-plugin` bundle；升级时迁移旧 profile 中 OwnDsh 管理的精确版本，避免 rc.5 离线 pnpm 为直接依赖查询 npm 元数据。 | 检查 `createPluginProfile()` 仍由官方 `applyRelease()` 调用，首次 profile 没有直接 npm 依赖，并确认旧 profile 迁移只删除版本完全匹配的 OwnDsh 包。 |
| `OWNDSH-PATCH-RUNTIME-DEPENDENCY` | `apps/desktop/src/project-manager.ts` | 把 OwnDsh 插件加入官方运行树的安装依赖，确保打包时进入 runtime。 | 检查 `createRuntimeProjectMetadata()` 仍是运行树安装依赖入口。 |
| `OWNDSH-PATCH-RUNTIME-RESOLUTION` | `apps/desktop/scripts/prepare-dsh.ts` | 将打包后的 `owndsh-plugin` 登记为 `@deepseek-ai/dsh` 的依赖，使 profile resolver 能从安装树发现它。 | 检查 runtime materialize 后仍从 `@deepseek-ai/dsh/package.json` 建立安装解析树。 |
| `OWNDSH-BRANDING` | `apps/desktop/scripts/electron-builder-config.mjs`、`apps/desktop/scripts/desktop-package-environment.mjs`、`apps/desktop/src/main.ts`、`apps/desktop/src/locale.ts`、`apps/desktop/scripts/development-app.ts`、`apps/desktop/scripts/*`、`apps/desktop/installer/*`、`apps/desktop/scripts/installer-locales.mjs` | 使用 OwnDsh Desktop 产品名、`com.owndsh.desktop` 默认 appId、官方 macOS unsigned 预设的稳定 appId、unsigned 产物顶层按 appId 固定的 designated requirement、`owndsh://` 协议、制品前缀、安装器文本、可见桌面文本和 macOS 本地网络用途声明。 | 检查官方 builder、unsigned 预设、顶层稳定 requirement、About、locale、开发应用、发行脚本和 `mac.extendInfo` 仍保留这些身份/权限接缝；协议、appId 或制品命名变更时同步登录/唤醒和更新发现入口。 |
| `OWNDSH-BRANDING` | `apps/desktop/resources/*` | 复制 OwnDsh 1104/About、Windows、macOS 和多尺寸托盘图标；平台 PNG 保持官方 1024×1024 规格与圆角内缩。 | 检查官方资源文件名和 builder 引用未变化；修改 `assets/icon.png` 后重生成全部派生资源。 |
| `OWNDSH-BRANDING` | `packages/client/ui-brand-official/src/client/index.ts` | 让左上角侧栏在 `local` 构建中也注册官方 `OfficialBrandMark` 和 `OfficialBrandName`，复用 DSH 正式版显示。 | 检查官方两个侧栏 slot 的注册入口和组件仍只负责显示；不得通过切换全局 build profile 或改写构建记录隐藏真实签名与源码状态。 |
| `OWNDSH-CLI-ISOLATION` | `apps/desktop/cli/*`、`apps/desktop/scripts/prepare-cli.ts`、`apps/desktop/src/command-*`、`apps/desktop/scripts/command-path.ps1`、`apps/desktop/src/locale.ts` | 将 OwnDsh 的全局命令注册为 `owndsh`，同时负责 CLI 启动器品牌、macOS 收据、Windows 注册表键、互斥键和 PATH 探测隔离；底层 CLI 仍复用官方实现。 | 检查官方命令入口、CLI 启动器、macOS 固定目标、Windows `owndsh.cmd` 检测和命令管理 UI 的接缝；若官方命令管理重构，重新确认两端安装不会争抢状态。 |
| `OWNDSH-DATA-ISOLATION` | `apps/desktop/src/main.ts` | 在日志、Host 和 profile 初始化前默认设置 `DSH_HOME=~/.owndsh`，并隔离 Electron `userData`/`sessionData`；显式环境变量与 `--user-data-dir` 仍优先。 | 检查 `app.setAppLogsPath()` 仍位于数据路径设置之后，且官方所有 Host/credentials/cache 路径继续从 `DSH_HOME` 派生。 |
| `OWNDSH-PACKAGING` | `apps/desktop/scripts/desktop-policy-environment.mjs` | 官方打包强制要求强制更新策略 origin；社区包没有官方策略服务，配假 origin 会把页面来源校验指向不存在的域。origin 未配置时返回 undefined，官方 builder 的 beforePack 本就有 `if (policy === undefined) return` 分支，自然跳过策略注入。 | 检查官方 builder 仍保留 policy 为 undefined 时的跳过分支。 |
| `OWNDSH-GITHUB-UPDATES` | `apps/desktop/scripts/electron-builder-config.mjs` | unsigned 包把 electron-updater 的 generic 源指向 `https://github.com/boe1900/owndsh-desktop/releases/latest/download`，Windows 读取 `nightly.yml`，macOS 读取 `nightly-mac.yml`；签名构建保留官方更新配置。 | 检查官方 `publish` 配置和 macOS `app-update.yml` 写入仍由同一 builder 接缝控制；Release 必须保留 feed、安装包和对应 blockmap 的原始文件名。 |
| `OWNDSH-ACCOUNT-MENU` | `packages/client/ui-settings-account/src/client/AccountMenu.tsx` | 从右下角更多菜单移除官方登录和意见反馈，保留设置与已登录后的退出登录；企业登录由 `owndsh-plugin` 门禁负责。 | 检查官方账号菜单的注入 props、菜单项 id 和登录对话框挂载点；若官方把入口移到新的 launcher，重新确认 OwnDsh 没有暴露官方账号体系。 |
| `OWNDSH-REMOTE-WORKSPACE` | `apps/web/src/main.ts` | 远端 view 复用 Host 已装配的 loader，启动前等待 IPC 流地址及原 Host gate；当前 mount 使用 `ownsHost: false`，页面失败不进入 Desktop fatal。 | 检查 `AppWebEntry` 仍等待全局启动 gate、Desktop IPC 仍返回可信流地址，且远端路径仍为 UUID mount；官方支持已装配远端页面及独立 transport 后删除对应补丁。 |

## 打包配置

`build/build.mjs` 把已由 `OWNDSH-BRANDING` 改写的官方 `apps/desktop/.env.windows.example` 复制为 `.env.windows`。appId 默认是 `com.owndsh.desktop`，macOS unsigned 预设也固定为该值，并在官方 `afterSign` 后只重签 App 顶层 requirement，同时保留官方 hardened runtime 与 entitlements，避免 ad-hoc cdhash 随构建变化导致 ShipIt 拒绝更新，并保留 nested helper 的原有签名；不要把这个 requirement 放进 electron-builder 的 `mac.requirements`，该配置会沿用到 nested code。策略 origin 为空触发 `OWNDSH-PACKAGING` 的跳过；unsigned 构建使用官方 macOS/Windows unsigned 入口，并在包内写入 OwnDsh GitHub Release 更新源；构建资源来自 `assets/`。

## GitHub Release 更新文件

`latest/download` 只按文件名转发 GitHub 最新 Release 的资产。`.github/workflows/build.yml` 在推送 `v*` 标签时构建三组安装包并自动下载 Artifacts，把去掉 `v` 的标签作为构建版本，创建或更新对应 Release；main push 不构建，PR/手动构建只上传 Artifacts，不发布 Release。标签必须是官方产品版本允许的构建版本，例如当前产品 `0.2.2-rc.5` 使用标签 `v0.2.2-rc.5`；官方产品版本升级后再使用对应的新版本。发布每个平台的新版本时，必须保留官方生成的文件名：Windows 为 `nightly.yml`、`*.exe`、`*.exe.blockmap`；macOS 为 `nightly-mac.yml`、每个架构的 `*.zip`、`*.zip.blockmap`，`.dmg` 只用于首次安装。Release 必须是已发布的最新版本，不能是 Draft；版本号也必须递增，否则 electron-updater 会认为没有新版本。

release job 必须保留各平台 Artifact 的独立目录，禁止先用 `merge-multiple: true` 展平；两个 macOS 任务产生同名 feed，会静默覆盖。`build/prepare-release.mjs` 按发行标签检查 Windows 安装包、ARM64/x64 的 DMG/ZIP 以及全部 blockmap，缺失或版本不符时停止发布。两端 feed 都按实际 EXE 或 ZIP 的大小和 SHA-512 重建，核心字段为 `version`、`files`、兼容字段 `path` 与 `sha512`、`releaseDate`。`nightly-mac.yml` 的 `files` 同时包含 ARM64/x64，兼容字段仍指向 Intel ZIP，electron-updater 6.8.9 根据文件名选择正确架构。JSON 序列化是有效 YAML，可由其标准解析器读取。未来若启用分批更新或其他 feed 字段，必须明确扩展生成契约，原 Artifact 清单不会透传。

`latest/download` 仅用于发现更新清单。两端清单的 `files[].url` 和 `path` 均固定为 `https://github.com/boe1900/owndsh-desktop/releases/download/<tag>/<原始文件名>`。GenericProvider 保留配置中的基址，若清单使用相对文件名，客户端持有旧清单期间 `latest` 切换会把旧文件名请求到新版本目录并返回 404。绝对地址使下载与清单所属版本绑定，已安装的 electron-updater 6.8.9 可直接读取，无需更换客户端或关闭差分下载。已经保存在客户端进程中的旧清单仍需重新检查更新后才会替换。

2026-11-20 对现有 `v0.2.2-rc.5` 仅替换 Windows `nightly.yml` 的两个下载地址字段，保留版本、日期、大小和校验值。线上 latest 与标签入口已由旧版 GenericProvider 解析，均指向 rc.5 EXE 且返回 HTTP 200。其余九个资产保持原件，包括仍使用相对地址的 macOS 清单；后续标签发布由修复后的脚本统一生成两端固定地址。当前 Windows 现场旧文件名的来源尚未确认，也未完成 Windows 真机原地安装验证。

## 登录掐断的边界

`OWNDSH-PATCH-LOGIN-GATE` 只掐断**原生 Electron 外壳的登录入口**：启动判定、账号登出回路、会话过期回路。三处短路后官方欢迎窗口在任何生命周期下都不再弹出。企业登录由 `owndsh-plugin` 的 `shell.overlay`（`order: -100`）接管。

官方 `account` namespace RPC、`DesktopPlatformView` 等仍然随官方外壳运行，只是没有入口触发它们——它们是 dead code，不是活跃路径，保留是为了让官方升级的 diff 最小化。

## 升级步骤

1. 修改 `upstream.json` 的 `tag` 和不可变 `commit`。
2. 运行 `npm test`。补丁接缝不匹配时会立即失败，不要放宽断言。
3. 阅读新生成源码中 `OWNDSH-PATCH-*` 和 `OWNDSH-PACKAGING` 标记，确认官方上下文没有改变。
4. **官方已实现的能力立即删除对应接缝**。`OWNDSH-PATCH-WIN-TRAY` 即为此例：早期官方外壳没有 Windows 托盘，rc.2 在 `src/tray.ts` 实现了完整的 `DesktopTray`，补丁变为重复声明并破坏 tsc。每个补丁只做官方还没做的事。
5. 在目标机器运行 `npm run build` 和打包后冒烟；macOS unsigned 使用官方 `package:mac:arm64:unsigned` 或 `package:mac:x64:unsigned`。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
