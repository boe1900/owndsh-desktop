/**
 * [INPUT]: 应用官方源码接缝、官方 npm Host 依赖与 OwnDsh 插件版本
 * [OUTPUT]: 验证独立数据根目录、首次插件 profile 播种和 Windows 托盘行为
 * [POS]: 官方 Desktop 发行差异的最小回归；完整安装包验收见 desktop-app.test.mjs
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { build } from 'esbuild'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const root = import.meta.dirname
const source = join(root, '.build/official-build/apps/desktop/src')

 test('official source keeps only the OwnDsh data/profile seams and Windows tray', async () => {
  const main = await readFile(join(source, 'main.ts'), 'utf8')
  const manager = await readFile(join(source, 'project-manager.ts'), 'utf8')
  const prepare = await readFile(join(root, '.build/official-build/apps/desktop/scripts/prepare-dsh.ts'), 'utf8')
  assert.match(main, /OWNDSH: 与官方 Desktop 共存/u)
  assert.match(main, /new Tray\(/u)
  assert.match(main, /退出 OwnDsh/u)
  assert.match(manager, /owndsh-plugin/u)
  assert.match(prepare, /LibreOfficeKit Windows DLL path seam changed/u)
  assert.match(prepare, /return path\.replace\(\/\\\\\.asar/u)
  assert.match(prepare, /env\.PATH = \[programDirectory, source\.PATH\]/u)
  assert.doesNotMatch(main, /credential-lock|DesktopUpdateCoordinator.*OWNDSH/u)
  const packagedSmoke = await readFile(join(root, '.build/official-build/apps/desktop/scripts/smoke-packaged-runtime.ts'), 'utf8')
  assert.match(packagedSmoke, /DSH_DESKTOP_SKIP_OFFICE_SMOKE/u)
})

async function compile(name, format) {
  return build({ entryPoints: [join(source, name + '.ts')], bundle: true, packages: 'external',
    platform: 'node', target: 'es2024', format, tsconfigRaw: {}, write: false })
}

test('first profile enables beta.10 once and preserves explicit uninstall', async () => {
  const compiled = await compile('project-manager', 'esm')
  const entry = join(root, 'runtime/test-profile.mjs')
  await writeFile(entry, compiled.outputFiles[0].text)
  const home = await mkdtemp(join(tmpdir(), 'OwnDsh profile '))
  try {
    const { createPluginProfile } = await import(pathToFileURL(entry).href)
    createPluginProfile(home)
    const path = join(home, 'package.json')
    const initial = JSON.parse(await readFile(path, 'utf8'))
    assert.equal(initial.dependencies['owndsh-plugin'], '0.1.0-beta.10')
    assert.ok(initial.dsh.profile.bundles.includes('owndsh-plugin'))
    delete initial.dependencies['owndsh-plugin']
    initial.dsh.profile.bundles = initial.dsh.profile.bundles.filter(name => name !== 'owndsh-plugin')
    await writeFile(path, JSON.stringify(initial))
    await writeFile(join(home, 'cordis.patch.yml'), '# user-owned patch\n')
    createPluginProfile(home)
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), initial)
    assert.equal(await readFile(join(home, 'cordis.patch.yml'), 'utf8'), '# user-owned patch\n')
  } finally {
    await rm(home, { recursive: true, force: true })
    await rm(entry, { force: true })
  }
})
