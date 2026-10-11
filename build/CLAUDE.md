# build/
> L2 | 父级: ../CLAUDE.md

checkout.mjs: 官方源码检出，git worktree 到 .build/，复用时 reset --hard 清回补丁前状态
build.mjs: 编排入口，检出 → 施加 patches/ → 复制已改写的 .env.example → 官方 Windows 或 macOS unsigned 流水线
prepare-release.mjs: 发布收口，按标签校验三平台安装包和 blockmap，以实际 ZIP 的 SHA-512 与大小生成双架构 macOS feed；不合并覆盖各架构同名文件
prepare-release.test.mjs: 发布回归验收，验证双架构 feed 与 ZIP 的校验值、Windows feed 保留、缺失 ARM ZIP/blockmap 与版本不匹配时阻断发布

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
