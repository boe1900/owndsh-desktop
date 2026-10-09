# workflows/
> L2 | 父级: ../CLAUDE.md

build.yml: 验证 build/patches.mjs 的接缝后调用官方 Electron 构建流水线产出 unsigned 安装包，上传为 Artifacts；缓存按 build/upstream.json 哈希键复用官方 checkout。不签名、不发布 Release；正式签名发行需另行配置。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
