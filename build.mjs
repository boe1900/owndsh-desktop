/**
 * [INPUT]: 官方 Harness tag、OwnDsh runtime lock 与原生构建机
 * [OUTPUT]: 官方 Desktop 原生运行树、Electron 安装包和构建清单
 * [POS]: 发行入口；只准备官方 checkout、应用 OWNDSH-PATCH 接缝并调用官方脚本
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { patchDesktop, patchNativeEntry } from './patch-desktop.mjs'
import sharp from 'sharp'

const root = dirname(fileURLToPath(import.meta.url))
const upstream = JSON.parse(await readFile(join(root, 'upstream.json'), 'utf8'))
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const runtimeManifest = JSON.parse(await readFile(join(root, 'runtime/package.json'), 'utf8'))
const cache = join(root, '.build/official-harness')
const checkout = join(root, '.build/official-build')
const output = join(root, 'dist/electron')
const pnpm = join(root, 'node_modules/pnpm/bin/pnpm.cjs')
const pluginVersion = runtimeManifest.dependencies['owndsh-plugin']
const target = process.platform === 'darwin' ? `mac-${process.arch}` : process.platform === 'win32' ? 'win-x64' : ''
assert.ok(['mac-x64', 'mac-arm64', 'win-x64'].includes(target), 'Use a native macOS/Windows builder')
assert.equal(manifest.version, runtimeManifest.dependencies['@deepseek-ai/dsh'])

const run = (command, args, options = {}) => execFileSync(command, args, {
  cwd: root,
  stdio: 'inherit',
  ...options,
  env: { ...process.env, ...options.env },
})
const official = (args, options = {}) => run(process.execPath, [pnpm, '--dir', checkout, ...args], options)

async function prepareCheckout() {
  await mkdir(join(root, '.build'), { recursive: true })
  if (!existsSync(cache)) run('git', ['clone', '--depth', '1', '--branch', upstream.tag, upstream.repository, cache])
  // 缓存只下载官方源码；OwnDsh 修改全部放进独立的构建 worktree。
  run('git', ['-C', cache, 'fetch', '--depth', '1', 'origin', 'tag', upstream.tag])
  assert.equal(run('git', ['-C', cache, 'rev-parse', `${upstream.tag}^{commit}`], { stdio: 'pipe', encoding: 'utf8' }).trim(), upstream.commit)
  run('git', ['-C', cache, 'sparse-checkout', 'disable'])
  const gitFile = join(checkout, '.git')
  let isWorktree = false
  if (existsSync(gitFile)) {
    try {
      isWorktree = run('git', ['-C', checkout, 'rev-parse', '--is-inside-work-tree'], {
        stdio: 'pipe', encoding: 'utf8',
      }).trim() === 'true'
    } catch {}
  }
  if (!isWorktree) {
    const downloads = join(checkout, 'apps/desktop/.desktop-build/downloads')
    const preservedDownloads = join(root, '.build/official-downloads')
    if (existsSync(downloads)) {
      await rm(preservedDownloads, { recursive: true, force: true })
      await rename(downloads, preservedDownloads)
    }
    await rm(checkout, { recursive: true, force: true })
    run('git', ['-C', cache, 'worktree', 'add', '--detach', checkout, upstream.commit])
    if (existsSync(preservedDownloads)) {
      await mkdir(dirname(downloads), { recursive: true })
      await rename(preservedDownloads, downloads)
    }
  } else {
    try {
      run('git', ['-C', checkout, 'reset', '--hard', upstream.commit])
      run('git', ['-C', checkout, 'clean', '-fd'])
    } catch {
      await rm(checkout, { recursive: true, force: true })
      run('git', ['-C', cache, 'worktree', 'add', '--detach', checkout, upstream.commit])
    }
  }
  await patchDesktop(checkout, pluginVersion)
  await patchNativeEntry(checkout)
  await writeFile(join(checkout, `apps/desktop/.env.${process.platform === 'darwin' ? 'macos' : 'windows'}`),
    'DSH_DESKTOP_APP_ID=com.owndsh.desktop.electron\n')
  const mask = Buffer.from('<svg width="1024" height="1024"><rect width="1024" height="1024" rx="224" fill="white"/></svg>')
  const icon = await sharp(join(root, 'assets/icon.png')).resize(1024, 1024).ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
  await sharp(icon).toFile(join(checkout, 'apps/desktop/resources/icon-windows.png'))
  await sharp(icon).resize(840, 840).extend({ top: 92, bottom: 92, left: 92, right: 92, background: '#00000000' })
    .toFile(join(checkout, 'apps/desktop/resources/icon-macos.png'))
  await writeFile(join(root, '.build/owndsh-upstream.diff'), run('git', ['-C', checkout, 'diff', '--', 'apps/desktop'], { stdio: 'pipe' }))
}

async function linkNativeEntryPackage() {
  if (process.platform !== 'darwin') return
  const name = `@deepseek-ai/node-addon-system-darwin-${process.arch}`
  const link = join(checkout, 'native/system/packages/entry/node_modules', name)
  // OWNDSH-PACKAGING: 官方 pack 解析 workspace 协议前，确保当前平台包的链接存在。
  await mkdir(dirname(link), { recursive: true })
  await rm(link, { recursive: true, force: true })
  await symlink(`../../../darwin-${process.arch}`, link, 'dir')
}

await prepareCheckout()
if (process.argv.includes('--source-only')) process.exit(0)
official(['install', '--frozen-lockfile', '--ignore-scripts'], { env: { CI: 'true' } })
await linkNativeEntryPackage()
const prepareOnly = process.argv.includes('--prepare-only')
// 编译、依赖打包、运行树、ASAR、安装器和 smoke 全部由官方 package-target 编排。
const packageEnv = ['win-x64', 'mac-x64'].includes(target) ? { DSH_DESKTOP_SKIP_OFFICE_SMOKE: '1' } : {}
official(['--filter', '@deepseek-ai/dsh-desktop', 'run', 'package', target, '--unsigned', ...(prepareOnly ? ['--prepare-only'] : [])], { env: packageEnv })
if (!prepareOnly) {
  await rm(output, { recursive: true, force: true })
  await mkdir(output, { recursive: true })
  const artifacts = join(checkout, 'apps/desktop/.desktop-build/targets', target, 'unsigned-artifacts')
  // OWNDSH-PACKAGING: 保留 framework 符号链接；解析后会破坏签名结构。
  await cp(artifacts, output, { recursive: true, verbatimSymlinks: true })
  await writeFile(join(output, 'build-info-official.json'), `${JSON.stringify({
    app: manifest.version,
    shell: 'official-electron',
    harness: runtimeManifest.dependencies['@deepseek-ai/dsh'],
    harnessCommit: upstream.commit,
    plugin: pluginVersion,
    target,
  }, null, 2)}\n`)
  const installers = (await readdir(output)).filter(name => /\.(dmg|zip|exe)$/.test(name))
  assert.ok(installers.length, 'Official packaging produced no installer')
  const sums = await Promise.all(installers.map(async name => `${createHash('sha256').update(await readFile(join(output, name))).digest('hex')}  ${name}`))
  await writeFile(join(output, `SHA256SUMS-${target}.txt`), sums.join('\n') + '\n')
}
