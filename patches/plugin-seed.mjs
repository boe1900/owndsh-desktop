/**
 * [INPUT]: 官方 project-manager.ts 的 profile 创建与运行树依赖
 * [OUTPUT]: 首次 profile 播种 owndsh-plugin 且官方运行树携带该插件
 * [POS]: patches/ 的插件预置；用户卸载后不复活，版本由 upstream.json 锁定
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyPatch } from './apply.mjs'

/**
 * 预置 owndsh-plugin：首次创建 profile 时播种，并加入官方运行树。
 * @param source - 临时官方 checkout 根目录
 * @param pluginVersion - 预置的 owndsh-plugin 精确版本
 */
export async function pluginSeed(source, pluginVersion) {
  await applyPatch(source, {
    marker: 'OWNDSH-PATCH-PROFILE-SEED',
    file: 'apps/desktop/src/project-manager.ts',
    replacements: [
      [`export function createPluginProfile(projectDir: string): void {
  initProfile(projectDir, WEB_PROFILE.bundles)
}`,
        `export function createPluginProfile(projectDir: string): void {
  // OWNDSH-PATCH-PROFILE-SEED: 只在官方首次创建 profile 时播种；用户卸载后不复活。
  const fresh = !existsSync(join(projectDir, 'package.json'))
  initProfile(projectDir, fresh ? [...WEB_PROFILE.bundles, 'owndsh-plugin'] : WEB_PROFILE.bundles)
  if (!fresh) return
  const manifestPath = join(projectDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.dependencies['owndsh-plugin'] = ${JSON.stringify(pluginVersion)}
  writeJson(manifestPath, manifest)
}`],
      ['    dependencies: desktopCorePackageOverrides(packageSet),\n',
        `    // OWNDSH-PATCH-RUNTIME-DEPENDENCY: 官方运行树额外携带 OwnDsh 插件，profile 才能开箱即用。
    dependencies: { ...desktopCorePackageOverrides(packageSet), 'owndsh-plugin': ${JSON.stringify(pluginVersion)} },
`],
    ],
    output: '官方运行树携带 OwnDsh；首次 profile 只启用一次插件',
  })
}
