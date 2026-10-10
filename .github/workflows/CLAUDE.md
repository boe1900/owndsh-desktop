# workflows/
> L2 | 父级: ../CLAUDE.md

build.yml: 验证 patches/patches.test.mjs 的接缝后调用官方 Electron 构建流水线产出 Windows/macOS unsigned 安装包、feed 元数据和 blockmap；普通 push/PR 只上传 Artifacts，推送 v* 标签时把去掉 v 的标签作为构建版本并由 release job 自动创建或更新 OwnDsh GitHub Release；缓存按 upstream.json 哈希键复用官方 checkout。不签名，正式签名发行需另行配置。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
