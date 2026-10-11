# workflows/
> L2 | 父级: ../CLAUDE.md

build.yml: 验证补丁接缝和发布验收后调用官方流水线产出 Windows/macOS unsigned 包；macOS 收集前严格校验最终 App 及 ZIP 内 App 的 ad-hoc 签名；main push 不构建，PR/手动构建只上传 Artifacts，v* 标签构建自动发布。release job 保留各平台下载目录，用 build/prepare-release.mjs 校验安装包/blockmap 并生成 ARM64/x64 共用 feed，防止 nightly-mac.yml 同名覆盖；缓存按 upstream.json 哈希键复用官方 checkout。Apple Developer 签名发行需另行配置。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
