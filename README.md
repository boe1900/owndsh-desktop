# OwnDsh Desktop — 官方 Electron 发行分支

`codex/official-desktop` 使用 DeepSeek Harness 官方 `apps/desktop` 与 `apps/desktop-host`，预装 `owndsh-plugin@0.1.0-beta.10`。Harness 固定 `0.1.7-alpha.1`，官方源码 commit 见 `upstream.json`。主分支继续维护原 Pake 发行。

官方 Electron 44.0.0 负责窗口、原生目录选择、认证转发、单实例、更新与 Host 生命周期；Web 和 Host 从官方 checkout 的原生构建流程生成。构建运行树遵循官方 `app/dsh` 布局，发行补丁只保留 Windows 托盘、独立数据目录和首次 profile 预装插件，不包含 bridge、兼容层或 Host 改写。OwnDsh 接缝见 [OFFICIAL-DESKTOP-PATCHES.md](OFFICIAL-DESKTOP-PATCHES.md)。

## 使用与数据

程序名为 **OwnDsh Electron**，可与官方 Desktop、Pake 版分别安装。OwnDsh 使用独立目录：

- macOS：`~/Library/Application Support/com.owndsh.desktop.electron/`
- Windows：`%APPDATA%/com.owndsh.desktop.electron/`

其中 `electron/` 保存 Electron 的 Cookie、缓存和窗口状态，`Harness/` 保存 Harness 的登录凭据、Server 配置、会话和插件 profile。`OWNDSH_DESKTOP_HOME` 可覆盖整个数据根目录，主要用于验收。不会读取或迁移官方 Desktop、Pake 或 `~/.dsh` 的数据。

首次启动会在独立的 `Harness/profiles/desktop` 中自动启用 `owndsh-plugin@0.1.0-beta.10`。之后插件安装、卸载和配置全部使用官方 Desktop 的 profile 与 Host 包管理；用户主动卸载后不会在重启时自动复活。

Windows 关闭窗口会隐藏到托盘，可从托盘恢复或退出；macOS 保持官方窗口行为。保留官方认证和更新实现，但社区 unsigned 包不注入官方更新地址或强制更新策略。

官方内置 Python、Node、pnpm 和 Office 库/技能完整保留，下载资产由官方哈希锁校验；使用者无需安装 Node 或 Python。项目所需 Git、Docker 等额外工具仍需自行安装。macOS 当前采用 ad-hoc 签名，没有 Developer ID 公证；Windows 当前不进行 Authenticode 签名。

## 构建与验证

在目标系统/架构使用 Node 24.14.1；首次构建需要联网下载固定官方源码、Electron 和官方工作区运行环境。

```sh
npm ci --ignore-scripts
npm ci --prefix runtime --ignore-scripts
npm run build
npm test
```

`dist/electron/` 生成 DMG 或 NSIS EXE，以及包含官方 commit、实际版本和插件版本的 `build-info-official.json`。`npm run prepare:runtime` 调用官方 `package --unsigned --prepare-only`；`npm run build` 调用官方准备流程、官方 Desktop build、官方 electron-builder 配置和官方 packaged-runtime smoke。本地和 CI 当前都固定使用社区 unsigned 分支；正式签名发行需要另行配置并调整入口。`npm run test:app` 通过 `OWNDSH_TEST_APP` 指定实际打包程序，用临时独立目录验证完整性、启动、原生模块、Word 转 PDF、插件 Server 保存、未登录卸载和重启。

三平台 GitHub Actions 在实验分支 push、PR 或手动触发，成功后提供 Artifacts。实验分支不自动创建 Release，不覆盖现有 Pake 包。应用体积包含 Electron 和官方 Python/Office 运行环境。

本仓库保持原 GPL-3.0-or-later 许可；官方 Harness 为 MIT，随包携带 `HARNESS-LICENSE` 与官方依赖声明，第三方依赖遵循各自许可证。
