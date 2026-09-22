/**
 * [INPUT]: 已应用发行补丁的官方源码、真实 npm Host 依赖与无网络 updater 替身
 * [OUTPUT]: 验证插件首次播种/卸载后不复活及三个更新操作均不可执行
 * [POS]: 官方 Desktop 发行差异的行为回归；窗口验收见 desktop-app.test.mjs
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { recoverCredentialLock } from './credential-lock.mjs'

const root = import.meta.dirname
const source = join(root, '.build/electron-source/apps/desktop/src')
const runtimeRequire = createRequire(join(root, 'runtime/package.json'))

test('credential recovery preserves live and malformed locks, removes only a dead owner', async () => {
  const home = await mkdtemp(join(tmpdir(), 'OwnDsh lock '))
  const path = join(home, '.credentials.yaml.lock')
  try {
    for (const content of [`${process.pid}\n`, 'invalid', '0', '-1']) {
      await writeFile(path, content)
      await recoverCredentialLock(home)
      assert.equal(await readFile(path, 'utf8'), content)
    }
    const dead = spawnSync(process.execPath, ['-e', '']).pid
    assert.ok(dead > 0)
    await writeFile(path, `${dead}\n`)
    await recoverCredentialLock(home)
    await assert.rejects(readFile(path), { code: 'ENOENT' })
  } finally { await rm(home, { recursive: true, force: true }) }
})

async function compile(name, format) {
  return build({ entryPoints: [join(source, name + '.ts')], bundle: true, packages: 'external',
    platform: 'node', target: 'es2024', format, tsconfigRaw: {}, write: false })
}

test('all update operations stay inert even with an available feed and a hostile caller', async () => {
  const compiled = await compile('update-coordinator', 'cjs')
  const module = { exports: {} }
  const require = name => name === 'electron' ? { app: {} }
    : name === 'electron-updater' ? { autoUpdater: {} } : runtimeRequire(name)
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, module, module.exports)
  let calls = 0
  const updater = new EventEmitter()
  updater.checkForUpdates = updater.downloadUpdate = updater.quitAndInstall = () => { calls++; throw new Error('Update network/install called') }
  const updates = new module.exports.DesktopUpdateCoordinator(() => { calls++ }, async () => { calls++; return true }, updater, () => true, () => '0.1.6-alpha.2')
  assert.deepEqual(await updates.check(true), { phase: 'idle' })
  assert.deepEqual(await updates.download('99.0.0'), { phase: 'idle' })
  assert.deepEqual(await updates.install('99.0.0'), { phase: 'idle' })
  assert.equal(calls, 0)
  updates.dispose()
})

test('first profile enables bundled beta.8, restart preserves explicit uninstall and user configuration', async () => {
  const compiled = await compile('project-manager', 'esm')
  const entry = join(root, '.build/electron-app/lib/test-profile.mjs')
  await writeFile(entry, compiled.outputFiles[0].text)
  const home = await mkdtemp(join(tmpdir(), 'OwnDsh profile '))
  try {
    const { createPluginProfile } = await import(pathToFileURL(entry))
    createPluginProfile(home)
    const path = join(home, 'package.json')
    const initial = JSON.parse(await readFile(path, 'utf8'))
    assert.equal(initial.dependencies['owndsh-plugin'], '0.1.0-beta.8')
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
