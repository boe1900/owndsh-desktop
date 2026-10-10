# OwnDsh Desktop - 官方 Electron 外壳的 OwnDsh 发行

官方 Harness `dsh-v0.2.0-rc.2` + Electron 44 + Node 24 + 预置 `owndsh-plugin` 0.1.0-beta.16

<directory>
patches/ - 全部发行补丁：每条官方源码接缝一个文件，由 index.mjs 聚合
assets/ - OwnDsh 图标源稿与 Windows/macOS/About/托盘派生资源
build/ - 官方源码检出与打包编排；不复制官方业务源码
.build/ - 临时官方 checkout 与裸库，构建产物，不提交
</directory>

<config>
upstream.json - 官方 deepseek-harness 仓库、tag、不可变 commit 与预置插件版本的唯一锁
patches/apply.mjs - 断言式替换底座；锚点默认必须命中一次，重复文本显式声明次数，官方升级改动了立即失败
patches/login-gate.mjs - 掐断官方登录入口（OWNDSH-PATCH-LOGIN-GATE）
patches/plugin-seed.mjs - 预置 owndsh-plugin（PROFILE-SEED + RUNTIME-DEPENDENCY）
patches/branding.mjs - OwnDsh Desktop 名称、appId 默认值、协议与平台图标
patches/cli-isolation.mjs - 独立 owndsh CLI 命令及命令所有权元数据
patches/data-isolation.mjs - 独立 DSH_HOME、Electron userData 和 sessionData
patches/port-isolation.mjs - Host WebServer 使用操作系统分配的空闲端口，支持与官方端并行运行
patches/macos-unsigned.mjs - 无 Apple 凭据时生成 macOS ARM64/x64 unsigned 产物，保留官方签名路径
patches/packaging.mjs - 打包配置接缝（OWNDSH-PACKAGING）
patches/index.mjs - 聚合入口；新增补丁在此登记一行
patches/patches.test.mjs - 沙箱副本上的全接缝断言验收，官方升级时的第一道门禁
build/checkout.mjs - 官方源码检出；复用 worktree 时 reset --hard 清回干净状态
build/build.mjs - 检出 → 施加补丁 → 官方原生构建流水线的编排入口
OFFICIAL-DESKTOP-PATCHES.md - 补丁台账、登录掐断边界与升级步骤
LICENSE - GPL-3.0-or-later
.gitignore / .gitattributes - 产物和秘密排除、跨平台文本换行
</config>

发行差异分为七个边界：掐断官方登录入口、预置 OwnDsh 插件、切换 OwnDsh Desktop 品牌、隔离本地数据、隔离终端命令、隔离 Host 端口、开源 unsigned 构建。默认 `DSH_HOME` 为 `~/.owndsh`，显式 `DSH_HOME` 仍可覆盖；appId、外部协议、Electron userData、平台图标、CLI 命令和 Host 端口与官方端分开。macOS unsigned 只用于公开构建和内部测试，不改变官方签名发行路径。历史分支的功能性改造（shell 运行时依赖提升、跨平台包收窄）已删除——官方 rc.2 已实现或不必要。不要从历史分支恢复任何补丁。

新增补丁：在 patches/ 建文件，用 apply.mjs 施加，在 index.mjs 登记一行，在 OFFICIAL-DESKTOP-PATCHES.md 记台账。升级时改 upstream.json 后先跑 npm test；断言失败即官方改动了接缝，按台账逐条核对，不要放宽断言。官方已实现的能力立即删除对应接缝。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
