# OwnDsh Desktop - 官方 Harness 与 OwnDsh 插件的独立桌面发行

Pake 3.16.1 + Tauri 2 + Node 24.14.1 + Harness 0.1.2-rc.1 + npm 锁定插件

<directory>
.github/ - 原生 macOS Intel/ARM、Windows x64 构建与标签草稿发布
assets/ - 自有品牌图与内置 Node 许可证
runtime/ - 官方 Harness、OwnDsh 插件与 pnpm 的独立 npm 精确版本锁
</directory>

<config>
package.json / package-lock.json - 构建工具依赖与 build/prepare:runtime/test 入口
build.mjs - 生成 Pake 副本、平台图标、运行树与 DMG/NSIS 包，不读取兄弟仓库
launcher.mjs - 首次离线播种用户 profile，启动回环 Host，管理进程和脱敏日志
windows-job.mjs - 使用 Harness 已安装的 koffi 创建 Windows Job，launcher 退出即回收后代
host.rs - Tauri setup/exit 适配，校验启动 URL，通过 stdin 管理 launcher 生命周期
launcher.test.mjs - 带空格路径、最小 PATH、首次启动、配置持久化、WebSocket、正常退出与 Windows 强杀回收的真实进程测试
README.md - 使用、数据、构建、发布和平台验证边界
LICENSE / LICENSE-EXCEPTION - Pake GPL-3.0-or-later 与上游例外声明
.gitignore / .gitattributes - 产物和秘密排除、跨平台文本换行
</config>

桌面层只拥有窗口、图标、托盘和服务生命周期。Web UI/工具属于官方 Harness，认证/企业能力属于独立插件；不复制两者业务源码，不内置 Server 地址或用户凭据。

运行依赖从 npm 获取并锁定 integrity；预发布 peer 的显式覆盖只统一到实际验收的 Harness 版本，禁止安装第二套 Host 单例依赖。升级时更新 runtime 清单和锁，三平台真实运行测试必须通过。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
