# Official Desktop patch ledger

本仓库从 `upstream.json` 固定的 DeepSeek Harness tag 生成一个临时官方 checkout。`patches/` 是唯一的 OwnDsh 发行接缝；不要直接修改 `.build/official-harness`，发行修改必须由构建脚本重现。

`patches/patches.test.mjs` 在每次运行时对沙箱副本施加全部补丁并断言每条接缝；官方升级改动了任何锚点上下文时会立即失败，不要放宽断言。

`apply.mjs` 的 L3 头部遵循目标文件语法：批处理使用 `@rem`，Shell、PowerShell 和 `.env` 使用 `#`，其余源码保留块注释；shebang 与 `@echo off` 保持首行，多补丁标记合并到单个头部。`apply.test.mjs` 验证头部折叠与旧头部迁移，并在目标平台运行无害的脚本夹具，防止注释被当作命令执行。

rc3 已提供 macOS ARM64/x64 的官方 `package:mac:*:unsigned` 入口，OwnDsh 直接复用；正式打包调用官方 `build:official`，其中 Client `tsc` 已覆盖账号菜单。接缝测试不替代类型检查。

## 新增补丁

1. 在 `patches/` 建一个文件，用 `apply.mjs` 的 `applyPatch` 施加（锚点默认恰好一次，重复文本显式声明命中次数）。
2. 在 `patches/index.mjs` 的 `applyPatches` 登记一行。
3. 在下面台账加一行，写清目的与升级检查。

## 设计原则

**发行边界是登录、插件、品牌、数据隔离和公开发行服务。** 不复制官方源码；名称、图标、appId、外部协议、数据根目录、更新源和账号菜单由补丁重现，官方升级时用断言暴露接缝变化。

## 当前接缝

| 标记 | 官方文件 | 目的 | 升级检查 |
| --- | --- | --- | --- |
| `OWNDSH-PATCH-LOGIN-GATE` | `apps/desktop/src/welcome-api.ts` | `needsWelcome()` 恒返回 `false`，官方原生欢迎窗口永不弹出；登录完全交给 OwnDsh 插件的 `shell.overlay` 门禁。 | 检查官方仍把欢迎判定收敛在这个单一函数。 |
| `OWNDSH-PATCH-LOGIN-GATE` | `apps/desktop/src/main.ts` | 掐断账号登出与会话过期两处重新弹欢迎窗口的回路。 | 检查 `previousAccountStatus` 与 `pendingWelcomeNotice` 的回调结构。 |
| `OWNDSH-PATCH-PROFILE-SEED` | `apps/desktop/src/project-manager.ts` | 首次创建 profile 时只写入 `owndsh-plugin` bundle；升级时迁移旧 profile 中 OwnDsh 管理的精确版本，避免 rc3 离线 pnpm 为直接依赖查询 npm 元数据。 | 检查 `createPluginProfile()` 仍由官方 `applyRelease()` 调用，首次 profile 没有直接 npm 依赖，并确认旧 profile 迁移只删除版本完全匹配的 OwnDsh 包。 |
| `OWNDSH-PATCH-RUNTIME-DEPENDENCY` | `apps/desktop/src/project-manager.ts` | 把 OwnDsh 插件加入官方运行树的安装依赖，确保打包时进入 runtime。 | 检查 `createRuntimeProjectMetadata()` 仍是运行树安装依赖入口。 |
| `OWNDSH-PATCH-RUNTIME-RESOLUTION` | `apps/desktop/scripts/prepare-dsh.ts` | 将打包后的 `owndsh-plugin` 登记为 `@deepseek-ai/dsh` 的依赖，使 profile resolver 能从安装树发现它。 | 检查 runtime materialize 后仍从 `@deepseek-ai/dsh/package.json` 建立安装解析树。 |
| `OWNDSH-BRANDING` | `apps/desktop/scripts/electron-builder-config.mjs`、`apps/desktop/src/main.ts`、`apps/desktop/src/locale.ts`、`apps/desktop/scripts/development-app.ts`、`apps/desktop/scripts/*`、`apps/desktop/installer/*` | 使用 OwnDsh Desktop 产品名、`com.owndsh.desktop` 默认 appId、`owndsh://` 协议、制品前缀、安装器文本、可见桌面文本和 macOS 本地网络用途声明。 | 检查官方 builder、About、locale、开发应用、发行脚本和 `mac.extendInfo` 仍保留这些身份/权限接缝；协议或制品命名变更时同步登录/唤醒和更新发现入口。 |
| `OWNDSH-BRANDING` | `apps/desktop/resources/*` | 复制 OwnDsh 1104/About、Windows、macOS 和多尺寸托盘图标；平台 PNG 保持官方 1024×1024 规格与圆角内缩。 | 检查官方资源文件名和 builder 引用未变化；修改 `assets/icon.png` 后重生成全部派生资源。 |
| `OWNDSH-CLI-ISOLATION` | `apps/desktop/cli/*`、`apps/desktop/scripts/prepare-cli.ts`、`apps/desktop/src/command-*`、`apps/desktop/scripts/command-path.ps1`、`apps/desktop/src/locale.ts` | 将 OwnDsh 的全局命令注册为 `owndsh`，同时负责 CLI 启动器品牌、macOS 收据、Windows 注册表键、互斥键和 PATH 探测隔离；底层 CLI 仍复用官方实现。 | 检查官方命令入口、CLI 启动器、macOS 固定目标、Windows `owndsh.cmd` 检测和命令管理 UI 的接缝；若官方命令管理重构，重新确认两端安装不会争抢状态。 |
| `OWNDSH-DATA-ISOLATION` | `apps/desktop/src/main.ts` | 在日志、Host 和 profile 初始化前默认设置 `DSH_HOME=~/.owndsh`，并隔离 Electron `userData`/`sessionData`；显式环境变量仍优先。 | 检查 `app.setAppLogsPath()` 仍位于数据路径设置之后，且官方所有 Host/credentials/cache 路径继续从 `DSH_HOME` 派生。 |
| `OWNDSH-PACKAGING` | `apps/desktop/scripts/desktop-policy-environment.mjs` | 官方打包强制要求强制更新策略 origin；社区包没有官方策略服务，配假 origin 会把页面来源校验指向不存在的域。origin 未配置时返回 undefined，官方 builder 的 beforePack 本就有 `if (policy === undefined) return` 分支，自然跳过策略注入。 | 检查官方 builder 仍保留 policy 为 undefined 时的跳过分支。 |
| `OWNDSH-GITHUB-UPDATES` | `apps/desktop/scripts/electron-builder-config.mjs` | unsigned 包把 electron-updater 的 generic 源指向 `https://github.com/boe1900/owndsh-desktop/releases/latest/download`，Windows 读取 `nightly.yml`，macOS 读取 `nightly-mac.yml`；签名构建保留官方更新配置。 | 检查官方 `publish` 配置和 macOS `app-update.yml` 写入仍由同一 builder 接缝控制；Release 必须保留 feed、安装包和对应 blockmap 的原始文件名。 |
| `OWNDSH-ACCOUNT-MENU` | `packages/client/ui-settings-account/src/client/AccountMenu.tsx` | 从右下角更多菜单移除官方登录和意见反馈，保留设置与已登录后的退出登录；企业登录由 `owndsh-plugin` 门禁负责。 | 检查官方账号菜单的注入 props、菜单项 id 和登录对话框挂载点；若官方把入口移到新的 launcher，重新确认 OwnDsh 没有暴露官方账号体系。 |

## 打包配置

`build/build.mjs` 把已由 `OWNDSH-BRANDING` 改写的官方 `apps/desktop/.env.windows.example` 复制为 `.env.windows`。appId 默认是 `com.owndsh.desktop`，策略 origin 为空触发 `OWNDSH-PACKAGING` 的跳过；unsigned 构建使用官方 macOS/Windows unsigned 入口，并在包内写入 OwnDsh GitHub Release 更新源；构建资源来自 `assets/`。

## GitHub Release 更新文件

`latest/download` 只按文件名转发 GitHub 最新 Release 的资产。`.github/workflows/build.yml` 在推送 `v*` 标签时构建三组安装包并自动下载 Artifacts，把去掉 `v` 的标签作为构建版本，创建或更新对应 Release；main push 不构建，PR/手动构建只上传 Artifacts，不发布 Release。标签必须是官方产品版本允许的构建版本，例如当前产品 `0.2.0-rc.2` 的更新可使用 `v0.2.0-rc.2.20261011.2`；官方产品版本升级后再使用对应的新版本。发布每个平台的新版本时，必须保留官方生成的文件名：Windows 为 `nightly.yml`、`*.exe`、`*.exe.blockmap`；macOS 为 `nightly-mac.yml`、每个架构的 `*.zip`、`*.zip.blockmap`，`.dmg` 只用于首次安装。Release 必须是已发布的最新版本，不能是 Draft；版本号也必须递增，否则 electron-updater 会认为没有新版本。

release job 必须保留各平台 Artifact 的独立目录，禁止先用 `merge-multiple: true` 展平；两个 macOS 任务产生同名 feed，会静默覆盖。`build/prepare-release.mjs` 按发行标签检查 Windows 安装包、ARM64/x64 的 DMG/ZIP 以及全部 blockmap，缺失或版本不符时停止发布；Windows feed 保留原件，macOS feed 按两个实际 ZIP 的大小和 SHA-512 重建。`nightly-mac.yml` 的 `files` 同时包含 ARM64/x64，electron-updater 6.8.9 根据文件名选择正确架构；JSON 序列化是有效 YAML，可由其标准解析器读取。

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
