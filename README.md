# OwnDsh Desktop

基于 DeepSeek Harness 官方 Electron 桌面端构建的 OwnDsh 发行。本仓库不复制官方业务源码；所有差异由 `patches/` 在构建时对官方 checkout 施加，官方升级时以断言暴露接缝变化。

当前锁定官方 `dsh-v0.2.0-rc.2`，预置 `owndsh-plugin@0.1.0-beta.16`（版本锁定见 `upstream.json`）。接缝清单与升级步骤见 [OFFICIAL-DESKTOP-PATCHES.md](OFFICIAL-DESKTOP-PATCHES.md)。

## 下载与首次启动

从 [Latest Release](https://github.com/boe1900/owndsh-desktop/releases/latest) 下载对应平台的安装包：Apple Silicon（M 系列）选择 `mac-arm64`，Intel Mac 选择 `mac-x64`，Windows 选择 `win-x64`。

公开 macOS 包未签名，首次启动可能被 Gatekeeper 拦截：

1. 打开 `.dmg`，将 `OwnDsh Desktop.app` 拖入“应用程序”。
2. 在“应用程序”中右键点击 `OwnDsh Desktop.app`，选择“打开”；如果系统仍拦截，打开“系统设置 → 隐私与安全性”，点击“仍要打开”。
3. 如果提示应用“已损坏”，退出提示后在终端执行：

   ```sh
   xattr -dr com.apple.quarantine "/Applications/OwnDsh Desktop.app"
   ```

   然后重新从“应用程序”打开。应用若安装在其他目录，请相应修改命令中的路径。

Windows 首次运行可能显示 SmartScreen 未验证发布者，选择“更多信息 → 仍要运行”即可。

## 自动更新

unsigned 包已经接入 OwnDsh 的 GitHub Release。Windows 从 `nightly.yml` 更新，macOS 从 `nightly-mac.yml` 更新；更新源地址是 [Latest Release assets](https://github.com/boe1900/owndsh-desktop/releases/latest/download)。向 `main` 推送代码只产生 Actions Artifacts；推送 `v*` 标签时，GitHub Actions 会去掉标签开头的 `v` 作为构建版本，并自动把 feed 文件、安装包和对应 blockmap 发布到 Release。当前产品版本是 `0.2.0-rc.2`，例如更新构建可以使用标签 `v0.2.0-rc.2.20261011.1`。只上传 `.exe` 或 `.dmg` 不能触发自动更新，Release 也必须是已发布的最新版本。

发布时只需推送标签：

```sh
git tag v0.2.0-rc.2.20261011.1
git push origin v0.2.0-rc.2.20261011.1
```

Actions 完成三个平台构建后，会自动创建或更新同名 Release。标签版本必须高于已安装版本；当前旧版 `0.2.0-rc.2` 需要先手动安装一次带更新配置的新包，之后才能自动升级。

## 与官方 Desktop 的关系

保留官方 Electron 外壳的全部原生能力，只在明确的发行接缝上做七件事：

1. **掐断官方登录入口**：原生欢迎窗口在任何生命周期下都不再弹出，登录由 `owndsh-plugin` 的 `shell.overlay` 企业门禁接管。
2. **预置 OwnDsh 插件**：首次创建 profile 时播种 `owndsh-plugin`，用户卸载后不复活。
3. **使用 OwnDsh Desktop 品牌**：产品名、appId、`owndsh://` 外部唤醒协议和平台图标独立于官方 Desktop。
4. **隔离本地数据**：默认使用 `~/.owndsh`、独立 Electron `userData` 和 `sessionData`；显式 `DSH_HOME` 仍然优先。
5. **隔离终端命令**：官方继续使用 `dsh`，OwnDsh 使用 `owndsh`；两者的命令注册状态也独立。
6. **接入 OwnDsh 更新源**：unsigned 包从 OwnDsh GitHub Release 读取更新元数据，签名构建仍沿用官方更新配置。
7. **清理官方账号入口**：右下角更多菜单不再显示官方登录和意见反馈，只保留设置与已登录后的退出登录。

这样官方 Desktop 与 OwnDsh Desktop 可以并行安装；官方 CLI 仍叫 `dsh`，OwnDsh Desktop 的独立命令叫 `owndsh`，两者的数据契约分别由 `DSH_HOME` 控制。

公开构建提供 Windows x64、macOS ARM64 和 macOS Intel 的 unsigned 包。它们不需要开发者证书，但 macOS 首次打开时会显示“无法验证开发者”；有 Apple Developer 凭据后可沿用官方签名与 notarization 流程。

## 目录结构

```
patches/                 # 每条官方源码接缝一个文件
├── apply.mjs            # 断言式替换底座
├── branding.mjs         # OwnDsh Desktop 名称、协议、appId 默认值和图标
├── cli-isolation.mjs    # 独立 owndsh 命令及命令管理状态
├── data-isolation.mjs   # 独立 DSH_HOME 与 Electron 数据目录
├── github-updates.mjs   # unsigned 包接入 OwnDsh GitHub Release 更新源
├── account-menu.mjs     # 移除右下角官方登录与意见反馈
├── login-gate.mjs       # 掐断官方登录入口
├── plugin-seed.mjs      # 预置 owndsh-plugin
├── packaging.mjs        # 打包配置接缝
├── index.mjs            # 聚合入口（新增补丁在此登记）
└── patches.test.mjs     # 接缝断言验收
assets/
├── icon.png             # OwnDsh 黑底白鲸源稿
└── icon-*.png / tray-windows.ico  # 平台派生图标
build/
├── checkout.mjs         # 官方源码检出（git worktree，用完即弃）
└── build.mjs            # 编排：检出 → 施加补丁 → 官方构建流水线
upstream.json            # 官方仓库、tag、commit 与预置插件版本的锁
```

## 构建与验证

在目标系统/架构使用 Node 24；首次构建需要联网下载官方源码、Electron 和官方工作区运行环境。

```sh
npm test
npm run build
```

`npm test` 在沙箱副本上施加全部补丁并断言每条接缝。`npm run build` 拉取 `upstream.json` 固定的官方源码，施加补丁，调用官方原生构建流水线产出 unsigned 安装包。

升级官方版本时：修改 `upstream.json` 的 `tag` 与 `commit`，运行 `npm test`，断言失败即说明官方改动了接缝上下文，按 [OFFICIAL-DESKTOP-PATCHES.md](OFFICIAL-DESKTOP-PATCHES.md) 的升级检查逐条核对。

## 许可

本仓库保持 GPL-3.0-or-later；官方 Harness 为 MIT，随包携带官方许可证与第三方依赖声明。
