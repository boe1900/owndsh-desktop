# Official Desktop patch ledger

本仓库从 `upstream.json` 固定的 DeepSeek Harness tag 生成一个临时官方 checkout。`patch-desktop.mjs` 是唯一的 OwnDsh 发行接缝；不要直接修改 `.build/official-harness`，发行修改必须由构建脚本重现。

`patch-desktop.test.mjs` 在每次运行时对沙箱副本施加全部补丁并断言每条接缝；官方升级改动了任何锚点上下文时会立即失败，不要放宽断言。

## 当前接缝

| 标记 | 官方文件 | 目的 | 升级检查 |
| --- | --- | --- | --- |
| `OWNDSH-PATCH-LOGIN-GATE` | `apps/desktop/src/welcome-api.ts` | `needsWelcome()` 恒返回 `false`，官方原生欢迎窗口永不弹出；登录完全交给 OwnDsh 插件的 `shell.overlay` 门禁。 | 检查官方仍把欢迎判定收敛在这个单一函数。 |
| `OWNDSH-PATCH-LOGIN-GATE` | `apps/desktop/src/main.ts` | 掐断账号登出与会话过期两处重新弹欢迎窗口的回路。 | 检查 `previousAccountStatus` 与 `pendingWelcomeNotice` 的回调结构。 |
| `OWNDSH-PATCH-DATA-ROOT` | `apps/desktop/src/main.ts` | 把 Electron `userData` 和 Harness `DSH_HOME` 放到 OwnDsh 独立根目录，使官方 Desktop 与 OwnDsh 共存。 | 检查官方单实例初始化前仍可设置两个路径。 |
| `OWNDSH-PATCH-PROFILE-SEED` | `apps/desktop/src/project-manager.ts` | 只在首次创建 profile 时写入 `owndsh-plugin` 和版本；用户卸载后不复活。 | 检查 `createPluginProfile()` 仍由官方 `applyRelease()` 调用。 |
| `OWNDSH-PATCH-RUNTIME-DEPENDENCY` | `apps/desktop/src/project-manager.ts` | 把 OwnDsh 插件加入官方 `app/dsh` 运行树，确保 profile 播种后能加载。 | 检查 `createRuntimeProjectMetadata()` 仍是运行树唯一依赖清单。 |
| `OWNDSH-PATCH-SHELL-RUNTIME` | `apps/desktop/package.json` | 把主进程实际导入的 `@deepseek-ai/dsh-home-paths` 从官方 `devDependencies` 提升为生产依赖，交给官方打包器纳入 `app.asar` 依赖闭包。 | 检查官方仍以 `workspace:*`/`workspace:^` 声明该运行时包；若官方主进程改为内联或改名，删除此接缝。 |
| `OWNDSH-PACKAGING` | `apps/desktop/scripts/electron-builder-config.mjs` | 使用 OwnDsh 独立应用名、包名和产物名；macOS unsigned 走 ad-hoc 签名并跳过公证。不改 Host、认证或 Web 行为。 | 检查官方 builder 配置仍是唯一打包配置。 |
| `OWNDSH-PACKAGING` | `apps/desktop/scripts/package-target.ts` | 保留官方完整准备、运行树校验、electron-builder 和 smoke，但允许社区包在没有官方签名/更新服务凭据时使用 unsigned 发行流程。 | 只影响构建时；正式签名环境仍可走官方 signed 分支。 |

## 登录掐断的边界

`OWNDSH-PATCH-LOGIN-GATE` 只掐断**原生 Electron 外壳的登录入口**：

- 启动时 `openInitialWindow()` 的 `needsWelcome()` 判定
- 账号登出后重新弹欢迎窗口的回路
- 会话过期回调重新弹欢迎窗口的回路

这三处短路后，官方欢迎窗口在任何生命周期下都不再弹出。企业登录由 `owndsh-plugin` 的 `shell.overlay`（`order: -100`）接管，其实现与升级边界见插件仓库的 `docs/dsh-compatibility.md`。

**不掐断的部分**：官方 `account` namespace RPC、`DesktopPlatformView`、`DesktopPolicyTestAuth` 仍然随官方外壳运行，只是没有入口触发它们。保留这些代码是为了让官方升级的 diff 最小化——它们是 dead code，不是活跃路径。若未来官方把登录收敛进新的模块，在此表新增一行接缝。

## 升级步骤

1. 修改 `upstream.json` 的 `tag` 和不可变 `commit`。
2. 运行 `npm test`。补丁接缝不匹配时会立即失败，不要放宽断言。
3. 阅读新生成源码中 `OWNDSH-PATCH-*` 和 `OWNDSH-PACKAGING` 标记，确认官方上下文没有改变。
4. **官方已实现的能力立即删除对应接缝**。`OWNDSH-PATCH-WIN-TRAY` 即为此例：早期官方外壳没有 Windows 托盘，rc.2 在 `src/tray.ts` 实现了完整的 `DesktopTray`（含 i18n、右键菜单、dispose），补丁变为重复声明并破坏 tsc。每个接缝的"删除条件"列就是这条规则的执行入口。
5. 在目标机器运行 `npm run build` 和打包后冒烟。
6. 只在官方功能已覆盖且用户明确要求时增加接缝。不要恢复 Pake bridge、Host 路径/端口改写、凭据锁或自定义 updater。

## 自动更新

官方 `electron-builder-config.mjs` 在 unsigned 模式下不注入更新地址（`resolveDesktopAutoUpdateConfig` 只在 signed 流程解析）。OwnDsh 社区包因此**不检查官方更新**，升级由本仓库重新构建并重新分发完成。若将来部署自有更新服务，在 `electron-builder-config.mjs` 接缝处改为指向自有 feed，并在本表记录。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
