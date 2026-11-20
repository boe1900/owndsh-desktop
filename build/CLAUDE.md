# build/
> L2 | 父级: ../CLAUDE.md

checkout.mjs: 官方源码检出，复用 bare Git 对象，每次删除旧 worktree 并按锁定 commit 重建，避免残留依赖与产物
build.mjs: 编排入口，检出 → 施加 patches/ → 复制已改写的 .env.example → 官方 Windows 或 macOS unsigned 流水线
prepare-release.mjs: 发布收口，先校验三平台安装包和 blockmap，再按实际 EXE/ZIP 的 SHA-512 与大小生成固定标签下载 URL 的两端 feed；macOS 合并双架构并保留 Intel 兼容默认值
prepare-release.test.mjs: 发布回归验收，验证两端固定版本 URL、实际 EXE/ZIP 校验值、双架构 macOS feed，以及缺失安装包/blockmap 与版本不匹配时阻断发布

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
