# OwnDsh Desktop - 官方 Harness Electron 的独立插件预装发行

Electron 44.0.0 + Harness 0.1.6-alpha.2 + OwnDsh 插件 0.1.0-beta.8 + esbuild + electron-builder

<directory>
.github/ - macOS Intel/ARM、Windows x64 实验分支构建与真实应用验收
assets/ - OwnDsh 品牌图与历史 Node 许可证
runtime/ - 官方 npm Host、Web、插件、pnpm 与 updater 依赖的精确锁
</directory>

<config>
package.json / package-lock.json - 构建与测试工具版本和脚本入口
upstream.json - 官方 Desktop 源码仓库、发布 tag 与不可变 commit
build.mjs - 下载固定源码、构建官方 Electron/Host、保留官方 primary-runtime、校验并生成安装包
patch-desktop.mjs - 在临时副本禁用更新、隔离数据目录、播种插件并接入企业包管理桥接
plugin-bridge.mjs - beta.8 Desktop 命令接口适配到官方 runPluginCommand，沿用官方锁/取消/包解析
credential-lock.mjs - 单实例锁之后、Host 启动之前保守回收死亡 PID 的凭据锁
desktop.test.mjs - 凭据锁恢复、更新拒绝网络与安装、profile 播种和卸载持久化回归
desktop-app.test.mjs - 实际 Electron 应用门禁、原生终端、持久化、未登录卸载及重启验收
README.md - 数据隔离、构建、许可及已知边界
LICENSE / LICENSE-EXCEPTION - 保留仓库原 GPL 许可和历史 Pake 声明；发行已不包含 Pake 代码
.gitignore / .gitattributes - 排除秘密、依赖与生成副本，统一换行
</config>

本分支只维护官方 Desktop 的发行差异。npm 插件原样消费；Desktop 源码在 .build/electron-source 内按固定接缝派生，缓存原始 checkout 保持干净。官方 profile/Host/认证/包管理实现是唯一机制，不自行复制。
实验版以 com.owndsh.desktop.electron 隔离真实用户数据；不自动迁移 Pake。自动/手动/强制更新均禁用，不能被环境变量或客户端调用恢复。版本必须匹配官方 shell/Host 发布；跨平台验收由原生 runner 执行。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
