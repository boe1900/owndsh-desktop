# Official Desktop patch ledger

本仓库从 `upstream.json` 固定的 DeepSeek Harness tag 生成一个临时官方 checkout。`patches/` 是唯一的 OwnDsh 发行接缝；不要直接修改 `.build/official-harness`，发行修改必须由构建脚本重现。

`patches/patches.test.mjs` 在每次运行时对沙箱副本施加全部补丁并断言每条接缝；官方升级改动了任何锚点上下文时会立即失败，不要放宽断言。

## 新增补丁

1. 在 `patches/` 建一个文件，用 `apply.mjs` 的 `applyPatch` 施加（锚点必须恰好一次）。
2. 在 `patches/index.mjs` 的 `applyPatches` 登记一行。
3. 在下面台账加一行，写清目的与升级检查。

## 设计原则

**只做两件事：掐断官方登录入口、预置 OwnDsh 插件。** 产物在名称、图标、appId、数据目录上与官方包完全一致，就是一个"去掉了登录的官方 DeepSeek Harness"。所有从历史分支沿袭的功能性改造（Windows 托盘、独立数据根目录、shell 运行时依赖提升、跨平台包收窄、名称改写）均已删除——官方 rc.2 要么已实现，要么不必要。

## 当前接缝

| 标记 | 官方文件 | 目的 | 升级检查 |
| --- | --- | --- | --- |
| `OWNDSH-PATCH-LOGIN-GATE` | `apps/desktop/src/welcome-api.ts` | `needsWelcome()` 恒返回 `false`，官方原生欢迎窗口永不弹出；登录完全交给 OwnDsh 插件的 `shell.overlay` 门禁。 | 检查官方仍把欢迎判定收敛在这个单一函数。 |
| `OWNDSH-PATCH-LOGIN-GATE` | `apps/desktop/src/main.ts` | 掐断账号登出与会话过期两处重新弹欢迎窗口的回路。 | 检查 `previousAccountStatus` 与 `pendingWelcomeNotice` 的回调结构。 |
| `OWNDSH-PATCH-PROFILE-SEED` | `apps/desktop/src/project-manager.ts` | 只在首次创建 profile 时写入 `owndsh-plugin` 和版本；用户卸载后不复活。 | 检查 `createPluginProfile()` 仍由官方 `applyRelease()` 调用。 |
| `OWNDSH-PATCH-RUNTIME-DEPENDENCY` | `apps/desktop/src/project-manager.ts` | 把 OwnDsh 插件加入官方 `app/dsh` 运行树，确保 profile 播种后能加载。 | 检查 `createRuntimeProjectMetadata()` 仍是运行树唯一依赖清单。 |
| `OWNDSH-PACKAGING` | `apps/desktop/scripts/desktop-policy-environment.mjs` | 官方打包强制要求强制更新策略 origin；社区包没有官方策略服务，配假 origin 会把页面来源校验指向不存在的域。origin 未配置时返回 undefined，官方 builder 的 beforePack 本就有 `if (policy === undefined) return` 分支，自然跳过策略注入。 | 检查官方 builder 仍保留 policy 为 undefined 时的跳过分支。 |

## 打包配置

`build/build.mjs` 把官方 `apps/desktop/.env.windows.example` 复制为 `.env.windows`。官方打包要求该文件存在；example 中的 appId、策略 origin 沿用官方原值，origin 为空触发上面的策略跳过。不改动 productName、artifactName、appId 或图标。
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
