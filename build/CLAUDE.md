# build/
> L2 | 父级: ../CLAUDE.md

checkout.mjs: 官方源码检出，git worktree 到 .build/，复用时 reset --hard 清回补丁前状态
build.mjs: 编排入口，检出 → 施加 patches/ → 复制已改写的 .env.example → 官方 package:win:x64:unsigned 流水线

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
