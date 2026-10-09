# OwnDsh Desktop - 官方 Electron 外壳的 OwnDsh 发行

官方 Harness `dsh-v0.2.0-rc.2` + Electron 44 + Node 24 + 预置 `owndsh-plugin` 0.1.0-beta.16

<directory>
.build/ - 临时官方 checkout 与裸库，构建产物，不提交
</directory>

<config>
upstream.json - 官方 deepseek-harness 仓库、tag 与不可变 commit 锁
runtime.json - 预置的 owndsh-plugin 精确版本
patch-desktop.mjs - 官方源码差异的唯一入口；断言式补丁，标记见 OFFICIAL-DESKTOP-PATCHES.md
patch-desktop.test.mjs - 沙箱副本上的全接缝断言验收，官方升级时的第一道门禁
checkout.mjs - 官方源码检出；复用 worktree 时 reset --hard 清回干净状态
build.mjs - 拉取官方源码、施加补丁并调用官方原生构建流水线的编排入口
OFFICIAL-DESKTOP-PATCHES.md - 补丁台账、登录掐断边界与升级步骤
README.md - 构建验证
LICENSE - GPL-3.0-or-later
.gitignore / .gitattributes - 产物和秘密排除、跨平台文本换行
</config>

只做两件事：掐断官方登录入口（`OWNDSH-PATCH-LOGIN-GATE`），预置 OwnDsh 插件（`OWNDSH-PATCH-PROFILE-SEED` + `OWNDSH-PATCH-RUNTIME-DEPENDENCY`）。产物名称、图标、appId 与官方包完全一致。历史分支的功能性改造（Windows 托盘、独立数据根目录、shell 运行时依赖提升、跨平台包收窄、名称改写）已全部删除——官方 rc.2 要么已实现，要么不必要。不要从历史分支恢复任何补丁。

升级时改 `upstream.json` 后先跑 `npm test`；断言失败即官方改动了接缝，按台账逐条核对，不要放宽断言。官方已实现的能力立即删除对应接缝。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
