# OwnDsh Desktop

基于 DeepSeek Harness 官方 Electron 桌面端构建的 OwnDsh 发行。本仓库不复制官方业务源码；所有差异由 `patch-desktop.mjs` 在构建时对官方 checkout 施加，官方升级时以断言暴露接缝变化。

当前锁定官方 `dsh-v0.2.0-rc.2`（commit 见 `upstream.json`），预置 `owndsh-plugin@0.1.0-beta.16`（版本见 `runtime.json`）。接缝清单与升级步骤见 [OFFICIAL-DESKTOP-PATCHES.md](OFFICIAL-DESKTOP-PATCHES.md)。

## 与官方 Desktop 的关系

保留官方 Electron 外壳的全部原生能力（窗口、托盘、单实例、更新、Host 生命周期、插件管理），只做三件事：

1. **掐断官方登录入口**：原生欢迎窗口在任何生命周期下都不再弹出，登录由 `owndsh-plugin` 的 `shell.overlay` 企业门禁接管。
2. **预置 OwnDsh 插件**：首次创建 profile 时播种 `owndsh-plugin`，用户卸载后不复活。
3. **独立应用身份**：独立应用名、独立数据目录，可与官方 Desktop 分别安装、共存不冲突。

## 安装与数据

程序名为 **OwnDsh Electron**。OwnDsh 使用独立目录：

- macOS：`~/Library/Application Support/com.owndsh.desktop.electron/`
- Windows：`%APPDATA%/com.owndsh.desktop.electron/`

其中 `electron/` 保存 Electron 的 Cookie、缓存和窗口状态，`Harness/` 保存 Harness 的凭据、Server 配置、会话和插件 profile。`OWNDSH_DESKTOP_HOME` 可覆盖整个数据根目录，主要用于验收。不会读取或迁移官方 Desktop 或 `~/.dsh` 的数据。

首次启动会在独立 profile 中自动启用 `owndsh-plugin`。之后插件安装、卸载和配置全部使用官方 Desktop 的 profile 与 Host 包管理。Windows 关闭窗口隐藏到托盘，可从托盘恢复或退出；macOS 保持官方窗口行为。

## 构建与验证

在目标系统/架构使用 Node 24；首次构建需要联网下载官方源码、Electron 和官方工作区运行环境。

```sh
npm test
npm run build
```

`npm test` 在沙箱副本上施加全部补丁并断言每条接缝。`npm run build` 拉取 `upstream.json` 固定的官方源码，施加补丁，调用官方原生构建流水线。`dist/` 产出 DMG 或 NSIS EXE。

升级官方版本时：修改 `upstream.json` 的 `tag` 与 `commit`，运行 `npm test`，断言失败即说明官方改动了接缝上下文，按 [OFFICIAL-DESKTOP-PATCHES.md](OFFICIAL-DESKTOP-PATCHES.md) 的升级检查逐条核对。

## 许可

本仓库保持 GPL-3.0-or-later；官方 Harness 为 MIT，随包携带官方许可证与第三方依赖声明。
