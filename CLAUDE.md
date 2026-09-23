# OwnDsh Desktop - 官方 Harness Electron 的独立插件预装发行

Electron 44.0.0 + Harness 0.1.7-alpha.1 + OwnDsh 插件 0.1.0-beta.10 + 官方 pnpm Desktop 构建

<directory>
.github/ - macOS Intel/ARM、Windows x64 原生构建与安装包验收
assets/ - OwnDsh 品牌图与历史 Node 许可证
runtime/ - 官方 npm Host、Web、插件、pnpm 与 updater 依赖的精确锁
</directory>
<config>
package.json / package-lock.json - 构建与测试工具版本和脚本入口
upstream.json - 官方 Desktop 源码仓库、发布 tag 与不可变 commit
build.mjs - 准备官方完整 checkout，并调用官方 Desktop 构建/运行树/安装包流程
patch-desktop.mjs - 维护运行时接缝和社区构建配置；接缝 ledger 见 OFFICIAL-DESKTOP-PATCHES.md
OFFICIAL-DESKTOP-PATCHES.md - 官方升级时的 OWNDSH-PATCH 标记、边界和验收步骤
desktop.test.mjs - 发行接缝与 profile 首次播种回归
desktop-app.test.mjs - 实际安装包完整性、原生模块、文档转换、插件接口和卸载验收
README.md - 数据目录、构建、许可及已知边界
LICENSE / LICENSE-EXCEPTION - 保留仓库原 GPL 许可和历史 Pake 声明；发行已不包含 Pake 代码
.gitignore / .gitattributes - 排除秘密、依赖与生成副本，统一换行
</config>

本分支只维护官方 Desktop 的必要发行差异。官方 profile、Host、认证、更新和插件包管理是唯一机制；OwnDsh 插件只在首次创建独立 Desktop profile 时由发行接缝预装一次，之后的启用、卸载和升级全部由官方实现。运行树保持官方 `app/dsh` 目录布局，避免改写 Host 路径、端口或安装锚点。升级时以 [OFFICIAL-DESKTOP-PATCHES.md](OFFICIAL-DESKTOP-PATCHES.md) 为接缝清单。

实验版使用 `com.owndsh.desktop.electron` 及独立 `DSH_HOME`，与官方 Desktop、Pake 和命令行共存。版本必须匹配官方 shell/Host 发布；跨平台验收由原生 runner 执行。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
