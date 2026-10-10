/**
 * [INPUT]: 官方 Electron Builder 更新发布配置与 OwnDsh unsigned 构建标记
 * [OUTPUT]: unsigned 包内嵌 OwnDsh GitHub Release 更新源，签名发行路径保持官方配置
 * [POS]: patches/ 的自动更新接缝；构建产物携带 nightly feed 供 GitHub Release 分发
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { applyPatch } from './apply.mjs'

const UPDATE_URL = 'https://github.com/boe1900/owndsh-desktop/releases/latest/download'

/**
 * 让公开 unsigned 包从 OwnDsh GitHub Release 读取更新元数据。
 * @param source - 临时官方 checkout 根目录
 */
export async function githubUpdates(source) {
  await applyPatch(source, {
    marker: 'OWNDSH-GITHUB-UPDATES',
    file: 'apps/desktop/scripts/electron-builder-config.mjs',
    replacements: [
      [`  const update = unsigned ? undefined : resolveDesktopAutoUpdateConfig(env, resolvedPlatform, resolvedArch)`,
        `  // OWNDSH-GITHUB-UPDATES: unsigned 公共包从 OwnDsh GitHub Release 读取 nightly feed。
  const update = unsigned
    ? { publicUrl: ${JSON.stringify(UPDATE_URL)} }
    : resolveDesktopAutoUpdateConfig(env, resolvedPlatform, resolvedArch)`],
      [`    publish: update === undefined ? null : [{ provider: 'generic', url: update.publicUrl, channel: 'nightly' }],`,
        `    // OWNDSH-GITHUB-UPDATES: --publish never 只禁止上传，保留 app-update.yml 供已发布 Release 使用。
    publish: update === undefined ? null : [{ provider: 'generic', url: update.publicUrl, channel: 'nightly' }],`],
    ],
    output: 'unsigned 包启用 OwnDsh GitHub Release nightly 更新源',
  })
}
