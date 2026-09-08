# OwnDsh Desktop

用 Pake 封装官方 DeepSeek Harness Web，预装 `owndsh-plugin`。本仓库只负责桌面窗口、托盘、内置运行环境和安装包；企业插件及服务端在 [owndsh](https://github.com/boe1900/owndsh) 独立维护。

当前锁定 Pake 3.16.1、Harness 0.1.2-rc.1、OwnDsh 插件 0.1.0-beta.3、Node 24.14.1 与 pnpm 11.26.0。

## 安装与使用

| 系统 | 安装包 | 原生构建机 |
| --- | --- | --- |
| macOS Intel | `OwnDsh-版本-macos-x64.dmg` | `macos-15-intel` |
| macOS Apple Silicon | `OwnDsh-版本-macos-arm64.dmg` | `macos-15` |
| Windows x64 | `OwnDsh-版本-windows-x64-setup.exe` | `windows-2022` |

从 [Actions](https://github.com/boe1900/owndsh-desktop/actions/workflows/build.yml) 下载最新成功构建的 Artifacts，或从 [Releases](https://github.com/boe1900/owndsh-desktop/releases) 下载维护者发布的安装包。每份制品附带 SHA-256 和实际依赖版本清单。

Mac 打开 DMG 后拖入 Applications；Windows 运行安装程序。打开应用会启动独立的本机 Harness Web 服务，仅监听 `127.0.0.1` 的空闲端口，沿用官方启动 token/Cookie 认证。首次自行填写 OwnDsh Server HTTP(S) 地址并登录，不预填任何地址或账号。

用户无需另装 Node、pnpm 或 Harness，首次 profile 创建使用随包资源。Windows 使用系统 WebView2；缺失时安装程序通过内置官方 bootstrapper 联网安装。登录、模型调用及额外插件下载仍需要网络。

关闭窗口会隐藏到托盘，正在运行的任务保留。托盘左键切换窗口、右键显示菜单；选“退出 OwnDsh”完全退出并回收 Host，Mac 也支持 Cmd+Q。Mac 图标带圆角透明留白，菜单栏使用随明暗主题变化的模板图。

macOS 配置最低 13.5，采用 ad-hoc 签名，尚无 Developer ID 公证；Windows 安装包尚无 Authenticode 签名。系统可能要求允许打开。构建/运行自动验证不等于所有系统版本的原生 UI 人工验收。

## 数据与运行边界

- macOS：`~/Library/Application Support/com.owndsh.desktop/Harness/`
- Windows：`%APPDATA%\com.owndsh.desktop\Harness\`

升级应用保留配置、凭据与 profile，不覆盖 `~/.dsh`。用户自行替换、安装或显式卸载的插件保持用户所有权；启动器只维护自己播种的依赖链接，并同步其 manifest 版本，防止后续安装其他插件时拉回旧版。日志 `desktop.log` 不记录启动 token；`desktop-runtime.json` 仅记录当前进程与不含 token 的回环地址。`OWNDSH_DESKTOP_HOME` 可指定隔离测试目录。

Harness 以当前用户身份运行，桌面层不额外限制 CPU、内存、工具进程数量或运行时长。Git、Python、Docker、编译器和其他 MCP 依赖按项目需要另行安装；工具审批与平台文件授权沿用现有机制。企业模型授权和配额由 OwnDsh Server 决定。

## 构建与验证

构建机需要 Node **24.14.1**、Rust **1.95.0** 和本机工具链：Mac 的 Xcode Command Line Tools，或 Windows 的 Visual Studio C++ Build Tools/Windows SDK。直接在目标系统与架构构建，运行依赖的原生模块由 npm 选择对应平台版本。

```sh
npm ci --ignore-scripts
npm ci --prefix runtime --ignore-scripts
npm run prepare:runtime
npm test
npm run build
```

构建输出位于 `dist/`，缓存位于 `.build/`。不需要 checkout 或构建 OwnDsh 插件仓库，也不读取本机账号。`runtime/package.json` 和双层 npm lock 固定发行内容；不要将浮动 `latest` 直接写入依赖。Pake 源码与其 Cargo.lock 来自锁定 npm 包，桌面 hook 只修改生成副本，上游接缝变化时构建立即失败。

运行测试使用带空格的临时目录与不含系统 Node/pnpm 的 PATH，验证内置命令、首次空配置、官方 Cookie/WebSocket、Server 持久化、退出回收和卸载不复活；Windows 额外验证强杀 launcher 后无 Host 遗留。Mac 构建后对 `.app` 内实际 runtime 复测并验证签名，Windows 静默安装到带空格路径后复测实际安装内容。插件认证、页面确认框和插件市场的业务测试保留在插件仓库，可通过 `OWNDSH_TEST_RUNTIME` 显式指向本仓库准备的运行树。

## GitHub 构建与发布

push `main`、PR 或手动 Run workflow 均构建三种安装包，互相独立并保留 14 天制品。正式交付时更新 `package.json`/`package-lock.json` 的桌面版本，推送相同的 `v版本` 标签；三平台通过后自动创建包含相同制品的 **草稿 Release**，审核后手动公开发布。

更新官方 Harness 或插件时，在 `runtime/package.json` 调整精确版本并更新 lock，通过三平台运行检查后再发桌面版本。插件不在本仓库构建、发布或打补丁。

本仓库沿用 Pake 的 GPL-3.0-or-later 与 LICENSE-EXCEPTION，保留上游声明。内置 Node 的许可证位于 `assets/NODE-LICENSE`，发行包同时携带 Node、Pake 及依赖包各自许可证；源码入口为本 GitHub 仓库，业务依赖的归属和许可仍以各自发布包为准。
