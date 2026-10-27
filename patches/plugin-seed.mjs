/**
 * [INPUT]: 官方 project-manager.ts 的 profile 创建与运行树依赖
 * [OUTPUT]: 首次 profile 播种 owndsh-plugin bundle，升级 OwnDsh 管理的旧副本，且官方运行树携带该插件
 * [POS]: patches/ 的插件预置；尊重用户卸载/禁用状态，版本由 upstream.json 锁定
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { applyPatch } from './apply.mjs'

/**
 * 预置 owndsh-plugin：首次创建 profile 时只播种 bundle 名称，并加入官方运行树。
 * @param source - 临时官方 checkout 根目录
 * @param pluginVersion - 预置的 owndsh-plugin 精确版本
 */
export async function pluginSeed(source, pluginVersion) {
  await applyPatch(source, {
    marker: 'OWNDSH-PATCH-PROFILE-SEED',
    file: 'apps/desktop/src/project-manager.ts',
    replacements: [
      ['  existsSync,\n', '  existsSync,\n  rmSync,\n'],
      [`export function createPluginProfile(projectDir: string): void {
  initProfile(projectDir, WEB_PROFILE.bundles)
}`,
        `export function createPluginProfile(projectDir: string): void {
  // OWNDSH-PATCH-PROFILE-SEED: 首次播种；只迁移 OwnDsh 精确版本，用户卸载/禁用不复活。
  const fresh = !existsSync(join(projectDir, 'package.json'))
  initProfile(projectDir, fresh ? [...WEB_PROFILE.bundles, 'owndsh-plugin'] : WEB_PROFILE.bundles)
  const manifestPath = join(projectDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (fresh) {
    writeJson(manifestPath, manifest)
    return
  }
  const dependency = manifest.dependencies?.['owndsh-plugin']
  if (typeof dependency !== 'string') return
  const installedPath = join(projectDir, 'node_modules', 'owndsh-plugin')
  let installedVersion
  try {
    installedVersion = JSON.parse(readFileSync(join(installedPath, 'package.json'), 'utf8')).version
  } catch {}
  if (dependency === installedVersion && installedVersion !== ${JSON.stringify(pluginVersion)}) {
    manifest.dependencies['owndsh-plugin'] = ${JSON.stringify(pluginVersion)}
    writeJson(manifestPath, manifest)
    rmSync(installedPath, { recursive: true, force: true })
  }
}`],
      ['    dependencies: desktopCorePackageOverrides(packageSet),\n',
        `    // OWNDSH-PATCH-RUNTIME-DEPENDENCY: 官方运行树额外携带 OwnDsh 插件，profile 才能开箱即用。
    dependencies: { ...desktopCorePackageOverrides(packageSet), 'owndsh-plugin': ${JSON.stringify(pluginVersion)} },
`],
    ],
    output: '官方运行树携带 OwnDsh；profile 更新只迁移 OwnDsh 管理的旧精确版本',
  })

  await applyPatch(source, {
    marker: 'OWNDSH-PATCH-RUNTIME-RESOLUTION',
    file: 'apps/desktop/scripts/prepare-dsh.ts',
    replacements: [
      [`    cpSync(modules, join(DSH_OUTPUT_ROOT, 'node_modules'), {
        recursive: true, dereference: true,
        filter: source => desktopRuntimeFileExclusion(relative(modules, source), target, officeEngine) === undefined,
      })
    })
    writeFileSync(join(DSH_OUTPUT_ROOT, 'package.json'),`,
        `    cpSync(modules, join(DSH_OUTPUT_ROOT, 'node_modules'), {
        recursive: true, dereference: true,
        filter: source => desktopRuntimeFileExclusion(relative(modules, source), target, officeEngine) === undefined,
      })
    })
    // OWNDSH-PATCH-RUNTIME-RESOLUTION: profile resolver walks dsh's dependency tree.
    const dshManifestPath = join(DSH_OUTPUT_ROOT, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
    const dshManifest = JSON.parse(readFileSync(dshManifestPath, 'utf8')) as { dependencies?: Record<string, string> }
    dshManifest.dependencies = { ...dshManifest.dependencies, 'owndsh-plugin': ${JSON.stringify(pluginVersion)} }
    writeFileSync(dshManifestPath, \`\${JSON.stringify(dshManifest, undefined, 2)}\\n\`)
    writeFileSync(join(DSH_OUTPUT_ROOT, 'package.json'),`],
    ],
    output: '将 OwnDsh 插件登记到 dsh 依赖树，供 profile resolver 发现',
  })
}
