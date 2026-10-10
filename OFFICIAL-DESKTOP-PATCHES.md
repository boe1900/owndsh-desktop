# Official Desktop patch ledger

本仓库从 `upstream.json` 固定的 DeepSeek Harness tag 生成一个临时官方 checkout。`patches/` 是唯一的 OwnDsh 发行接缝；不要直接修改 `.build/official-harness`，发行修改必须由构建脚本重现。

`patches/patches.test.mjs` 在每次运行时对沙箱副本施加全部补丁并断言每条接缝；官方升级改动了任何锚点上下文时会立即失败，不要放宽断言。

## 新增补丁

1. 在 `patches/` 建一个文件，用 `apply.mjs` 的 `applyPatch` 施加（锚点默认恰好一次，重复文本显式声明命中次数）。
2. 在 `patches/index.mjs` 的 `applyPatches` 登记一行。
3. 在下面台账加一行，写清目的与升级检查。

## 设计原则

**发行边界是登录、插件、品牌和数据隔离。** 不复制官方源码；名称、图标、appId、外部协议和数据根目录由补丁重现，官方升级时用断言暴露接缝变化。

## 当前接缝

| 标记 | 官方文件 | 目的 | 升级检查 |
| --- | --- | --- | --- |
| `OWNDSH-PATCH-LOGIN-GATE` | `apps/desktop/src/welcome-api.ts` | `needsWelcome()` 恒返回 `false`，官方原生欢迎窗口永不弹出；登录完全交给 OwnDsh 插件的 `shell.overlay` 门禁。 | 检查官方仍把欢迎判定收敛在这个单一函数。 |
| `OWNDSH-PATCH-LOGIN-GATE` | `apps/desktop/src/main.ts` | 掐断账号登出与会话过期两处重新弹欢迎窗口的回路。 | 检查 `previousAccountStatus` 与 `pendingWelcomeNotice` 的回调结构。 |
| `OWNDSH-PATCH-PROFILE-SEED` | `apps/desktop/src/project-manager.ts` | 只在首次创建 profile 时写入 `owndsh-plugin` 和版本；用户卸载后不复活。 | 检查 `createPluginProfile()` 仍由官方 `applyRelease()` 调用。 |
| `OWNDSH-PATCH-RUNTIME-DEPENDENCY` | `apps/desktop/src/project-manager.ts` | 把 OwnDsh 插件加入官方运行树的安装依赖，确保打包时进入 runtime。 | 检查 `createRuntimeProjectMetadata()` 仍是运行树安装依赖入口。 |
| `OWNDSH-PATCH-RUNTIME-RESOLUTION` | `apps/desktop/scripts/prepare-dsh.ts` | 将打包后的 `owndsh-plugin` 登记为 `@deepseek-ai/dsh` 的依赖，使 profile resolver 能从安装树发现它。 | 检查 runtime materialize 后仍从 `@deepseek-ai/dsh/package.json` 建立安装解析树。 |
| `OWNDSH-BRANDING` | `apps/desktop/scripts/electron-builder-config.mjs`、`apps/desktop/src/main.ts`、`apps/desktop/src/locale.ts`、`apps/desktop/scripts/development-app.ts`、`apps/desktop/scripts/*`、`apps/desktop/installer/*` | 使用 OwnDsh Desktop 产品名、`com.owndsh.desktop` 默认 appId、`owndsh://` 协议、制品前缀、安装器文本和可见桌面文本。 | 检查官方 builder、About、locale、开发应用和发行脚本仍保留这些身份接缝；协议或制品命名变更时同步登录/唤醒和更新发现入口。 |
| `OWNDSH-BRANDING` | `apps/desktop/resources/*` | 复制 OwnDsh 1104/About、Windows、macOS 和多尺寸托盘图标；平台 PNG 保持官方 1024×1024 规格与圆角内缩。 | 检查官方资源文件名和 builder 引用未变化；修改 `assets/icon.png` 后重生成全部派生资源。 |
| `OWNDSH-CLI-ISOLATION` | `apps/desktop/cli/*`、`apps/desktop/scripts/prepare-cli.ts`、`apps/desktop/src/command-*`、`apps/desktop/scripts/command-path.ps1`、`apps/desktop/src/locale.ts` | 将 OwnDsh 的全局命令注册为 `owndsh`，同时负责 CLI 启动器品牌、macOS 收据、Windows 注册表键、互斥键和 PATH 探测隔离；底层 CLI 仍复用官方实现。 | 检查官方命令入口、CLI 启动器、macOS 固定目标、Windows `owndsh.cmd` 检测和命令管理 UI 的接缝；若官方命令管理重构，重新确认两端安装不会争抢状态。 |
| `OWNDSH-DATA-ISOLATION` | `apps/desktop/src/main.ts` | 在日志、Host 和 profile 初始化前默认设置 `DSH_HOME=~/.owndsh`，并隔离 Electron `userData`/`sessionData`；显式环境变量仍优先。 | 检查 `app.setAppLogsPath()` 仍位于数据路径设置之后，且官方所有 Host/credentials/cache 路径继续从 `DSH_HOME` 派生。 |
| `OWNDSH-PORT-ISOLATION` | `apps/desktop-host/src/index.ts` | 将 WebServer 启动参数从固定 `19387` 改为 `0`，由操作系统分配空闲回环端口；官方 Host 与 OwnDsh 可同时运行，Host 仍通过 `ctx.webServer.port` 生成真实访问 URL。 | 检查官方 Host 仍把 WebServer 端口作为启动参数传给 profile，且 `dsh-host-webserver` 仍支持 `port: 0` 并暴露实际监听端口。 |
| `OWNDSH-MAC-UNSIGNED` | `apps/desktop/scripts/desktop-package-environment.mjs`、`apps/desktop/scripts/electron-builder-config.mjs`、`apps/desktop/scripts/package-target.ts`、`apps/desktop/scripts/smoke-packaged-runtime.ts` | 无 Apple Developer 凭据时生成 macOS ARM64/x64 unsigned `.dmg`/`.zip`，使用独立 unsigned-artifacts 目录并跳过签名/notarization；官方签名路径保持不变。 | 检查官方 `--unsigned-mac` 入口、macOS builder 的签名与 notarization hook、冒烟路径仍存在；若上游改动签名前置校验，重新确认 unsigned 只绕过凭据而不绕过运行时验收。 |
| `OWNDSH-PACKAGING` | `apps/desktop/scripts/desktop-policy-environment.mjs` | 官方打包强制要求强制更新策略 origin；社区包没有官方策略服务，配假 origin 会把页面来源校验指向不存在的域。origin 未配置时返回 undefined，官方 builder 的 beforePack 本就有 `if (policy === undefined) return` 分支，自然跳过策略注入。 | 检查官方 builder 仍保留 policy 为 undefined 时的跳过分支。 |

## 打包配置

`build/build.mjs` 把已由 `OWNDSH-BRANDING` 改写的官方 `apps/desktop/.env.windows.example` 复制为 `.env.windows`。appId 默认是 `com.owndsh.desktop`，策略 origin 为空触发 `OWNDSH-PACKAGING` 的跳过；构建资源来自 `assets/`。

## 登录掐断的边界

`OWNDSH-PATCH-LOGIN-GATE` 只掐断**原生 Electron 外壳的登录入口**：启动判定、账号登出回路、会话过期回路。三处短路后官方欢迎窗口在任何生命周期下都不再弹出。企业登录由 `owndsh-plugin` 的 `shell.overlay`（`order: -100`）接管。

官方 `account` namespace RPC、`DesktopPlatformView` 等仍然随官方外壳运行，只是没有入口触发它们——它们是 dead code，不是活跃路径，保留是为了让官方升级的 diff 最小化。

## 升级步骤

1. 修改 `upstream.json` 的 `tag` 和不可变 `commit`。
2. 运行 `npm test`。补丁接缝不匹配时会立即失败，不要放宽断言。
3. 阅读新生成源码中 `OWNDSH-PATCH-*` 和 `OWNDSH-PACKAGING` 标记，确认官方上下文没有改变。
4. **官方已实现的能力立即删除对应接缝**。`OWNDSH-PATCH-WIN-TRAY` 即为此例：早期官方外壳没有 Windows 托盘，rc.2 在 `src/tray.ts` 实现了完整的 `DesktopTray`，补丁变为重复声明并破坏 tsc。每个补丁只做官方还没做的事。
5. 在目标机器运行 `npm run build` 和打包后冒烟。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
