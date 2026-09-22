# OwnDsh Desktop — 官方 Electron 实验分支

`codex/official-desktop` 使用 DeepSeek Harness 官方 `apps/desktop` 与 `apps/desktop-host`，预装 `owndsh-plugin@0.1.0-beta.8`。Harness 固定 `0.1.6-alpha.2`，官方源码 commit 见 `upstream.json`。主分支继续维护原 Pake 发行。

官方 Electron 44.0.0 负责窗口、原生目录选择、认证转发、单实例、恢复与 Host 生命周期；Web 和 Host 从 npm 精确版本锁加载。源码补丁只存在于 `.build` 副本，`patch-desktop.mjs` 在上游接缝不匹配时立即失败。无需构建企业插件或服务端源码。

运行时保留为普通文件目录，不放进 ASAR：官方 LibreOffice helper 的 `spawn` 和资源目录参数需要真实路径。拷贝锁定依赖并保留 peer 依赖，沿用官方规则移除 source map、类型声明和其他平台的预构建文件；ConPTY 的构建输入副本也只保留目标架构。

自动检查、下载、安装与强制更新暂时禁用：隐藏更新菜单和页面 API，停止后台轮询，协调器拒绝执行更新操作，强更策略不初始化。安装包不带更新源，构建不要求 COS、更新服务或签名凭据。恢复更新时需显式修改补丁、发布配置和对应测试。

## 使用与数据

程序名为 **OwnDsh Electron**，与现有 Pake 版可分别安装。测试分支使用独立目录：

- macOS：`~/Library/Application Support/com.owndsh.desktop.electron/Harness/`
- Windows：`%APPDATA%\com.owndsh.desktop.electron\Harness\`

`OWNDSH_DESKTOP_HOME` 可覆盖该目录；其内部 `electron/` 也隔离测试浏览器存储。官方桌面 profile 位于 `profiles/desktop`。此实验版不自动迁移 Pake 或 `~/.dsh` 数据，首次自行填写 Server 并登录。覆盖同一实验版应用保留该目录。

插件只在全新 profile 中启用；用户卸载、禁用和替换后的状态保持。`beta.8` 的社区 Desktop 包管理接口由 `plugin-bridge.mjs` 转到官方 `runPluginCommand`，沿用官方锁、取消和内置 pnpm，不修改插件包。卸载后按页面提示退出并重新打开应用。

启动时保留凭据死锁恢复：只有锁内 PID 已不存在、锁文件未被替换时才删除，活跃或格式异常的锁保持不动。

官方内置 Python、Node、pnpm 和 Office 库/技能完整保留，下载资产由官方哈希锁校验；使用者无需安装 Node 或 Python。项目所需 Git、Docker 等额外工具仍需自行安装。此版本采用官方窗口关闭行为：macOS 关闭窗口后可由 Dock 重开，Windows 最后窗口关闭则退出。

macOS 当前采用 ad-hoc 签名，没有 Developer ID 公证；Windows 当前不进行 Authenticode 签名。正式发布前仍需对应平台验收。

## 构建与验证

在目标系统/架构使用 Node 24.14.1；首次构建需要联网下载固定官方源码、Electron 和官方工作区运行环境。

```sh
npm ci --ignore-scripts
npm ci --prefix runtime --ignore-scripts
node node_modules/electron/install.js
npm run build
npm test
```

`dist/electron/` 生成 DMG 或 NSIS EXE，以及包含官方 commit、实际版本、禁用更新状态的 `build-info-*.json` 和 SHA-256。`npm run prepare:runtime` 只准备并校验运行树。安装包在原生签名后更新最终运行树清单。`npm run test:app` 通过 `OWNDSH_TEST_APP` 指定实际打包程序，用隔离目录验证完整性、启动、原生模块、Word 转 PDF、Server 保存、未登录卸载和重启。

三平台 GitHub Actions 在实验分支 push、PR 或手动触发，成功后提供 Artifacts。实验分支不自动创建 Release，不覆盖现有 Pake 包。应用体积包含 Electron 和官方 Python/Office 运行环境。

本仓库保持原 GPL-3.0-or-later 许可；官方 Harness 为 MIT，随包携带 `HARNESS-LICENSE` 与官方依赖声明，第三方依赖遵循各自许可证。
