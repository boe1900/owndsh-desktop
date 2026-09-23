# Official Desktop patch ledger

本仓库从 `upstream.json` 固定的 DeepSeek Harness tag 生成一个临时官方 checkout。`patch-desktop.mjs` 是唯一的 OwnDsh 发行接缝；不要直接修改 `.build/official-harness` 或 `.build/official-build`，发行修改必须由构建脚本重现。

## 当前接缝

| 标记 | 官方文件 | 目的 | 升级检查 |
| --- | --- | --- | --- |
| `OWNDSH-PATCH-DATA-ROOT` | `apps/desktop/src/main.ts` | 把 Electron `userData` 和 Harness `DSH_HOME` 放到 OwnDsh 独立根目录，使官方 Desktop、Pake 和 OwnDsh 共存。 | 检查官方单实例初始化前仍可设置两个路径。 |
| `OWNDSH-PATCH-WIN-TRAY` | `apps/desktop/src/main.ts` | Windows 关闭窗口隐藏到托盘，托盘菜单交给官方 `app.quit()` 退出。 | 检查主窗口、欢迎窗口和 `will-quit` 生命周期名称。 |
| `OWNDSH-PATCH-RUNTIME-DEPENDENCY` | `apps/desktop/src/project-manager.ts` | 把 OwnDsh 插件加入官方 `app/dsh` 运行树，确保 profile 播种后能加载。 | 检查 `createRuntimeProjectMetadata()` 仍是运行树唯一依赖清单。 |
| `OWNDSH-PATCH-PROFILE-SEED` | `apps/desktop/src/project-manager.ts` | 只在首次创建 profile 时写入 `owndsh-plugin` 和版本；用户卸载后不复活。 | 检查 `createPluginProfile()` 仍由官方 `applyRelease()` 调用。 |
| `OWNDSH-PACKAGING` | `apps/desktop/scripts/package-target.ts`、`desktop-package-environment.mjs`、`prepare-dsh.ts` | 保留官方完整准备、运行树校验、electron-builder 和 smoke，但允许社区包在没有官方签名/更新服务凭据时使用 unsigned 发行流程。 | 只影响构建时；正式签名环境仍可走官方 signed 分支。 |
| `OWNDSH-PACKAGING` | `apps/desktop/scripts/electron-builder-config.mjs`、`smoke-packaged-runtime.ts` | 使用 OwnDsh 独立应用名、包名、图标和可执行文件名；不改 Host、认证或 Web 行为。 | 检查官方 builder 配置仍是唯一打包配置。 |
| `OWNDSH-PATCH-BUILD-ORDER` | `apps/desktop/scripts/macos-notarization-proxy.ts` | native `flock` 在官方 native 构建后才生成，按需加载保证干净 CI runner 能先加载官方打包入口；正式签名代理行为不变。 | 检查 `withProxyLock()` 仍在 native 构建完成后执行。 |
| `OWNDSH-PATCH-ASAR-NATIVE` | `apps/desktop/scripts/prepare-dsh.ts` | 将 LibreOfficeKit 原生 helper 的 Electron 路径从虚拟 `app.asar` 切到实际的 `app.asar.unpacked`，并在 Windows helper 启动时把 `program/program` 放到 DLL 搜索路径前；只影响打包后的原生 Office 转换。 | 检查 LibreOfficeKit 的 `asset()` 和 `nativeEnvironment()` 仍在运行树物化后单点修补，官方包升级时重新确认函数锚点。 |

## 升级步骤

1. 修改 `upstream.json` 的 `tag` 和不可变 `commit`。
2. 运行 `npm run prepare:runtime`。补丁接缝不匹配时会立即失败，不要放宽断言。
3. 阅读新生成源码中 `OWNDSH-PATCH-*` 和 `OWNDSH-PACKAGING` 标记，确认官方上下文没有改变。
4. 运行 `npm test`；在目标机器再运行 `npm run build` 和 `npm run test:app`。
5. 只在官方功能已覆盖且用户明确要求时增加接缝。不要恢复 Pake bridge、Host 路径/端口改写、凭据锁或自定义 updater。

官方构建路径由 `apps/desktop/scripts/package-target.ts` 负责；本仓库的 `build.mjs` 只调用官方构建阶段，不复制或重写 electron-builder 配置。

## 构建依赖提示

`patchNativeEntry()` 会在官方 install 前将 `native/system/packages/entry` 的 optional workspace 依赖收窄到当前目标平台，并让 pnpm 更新临时 checkout 的 importer；随后 `linkNativeEntryPackage()` 只建立当前平台的 workspace 链接。其余 optional 依赖保留由 pnpm 按 runner 的 OS/CPU 选择，官方 Rolldown 等构建工具的 native binding 不能被全局禁用。该文件和修改后的官方 checkout 都属于生成物，每次 checkout 重建都会覆盖。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
