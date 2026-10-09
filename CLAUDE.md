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
build.mjs - 拉取官方源码、施加补丁并调用官方原生构建流水线的编排入口
OFFICIAL-DESKTOP-PATCHES.md - 补丁台账、登录掐断边界与升级步骤
README.md - 使用、数据边界与构建验证
LICENSE - GPL-3.0-or-later
.gitignore / .gitattributes - 产物和秘密排除、跨平台文本换行
</config>

桌面层只拥有窗口、托盘、单实例和应用身份。Host、Web UI、工具、插件管理和登录门禁全部归官方外壳与 OwnDsh 插件；本仓库不复制两者业务源码，不内置 Server 地址或用户凭据。官方登录入口由 `OWNDSH-PATCH-LOGIN-GATE` 掐断，企业登录由插件的 `shell.overlay` 接管。

升级时改 `upstream.json` 后先跑 `npm test`；断言失败即官方改动了接缝，按台账逐条核对，不要放宽断言。不恢复 Pake bridge、Host 路径改写、凭据锁或自定义 updater。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
