/**
 * [INPUT]: upstream.json 固定官方源码、npm 双锁、OwnDsh 图标与原生构建机
 * [OUTPUT]: 官方 Electron Desktop + Harness + 插件的离线安装包及版本/摘要清单
 * [POS]: OwnDsh 发行编排；复用官方窗口、Host、primary-runtime 和运行树校验
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { chmod, cp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import sharp from 'sharp'
import { patchDesktop } from './patch-desktop.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const windows = process.platform === 'win32'
assert.ok(windows ? process.arch === 'x64' : process.platform === 'darwin' && ['x64', 'arm64'].includes(process.arch), 'Use a native macOS/Windows builder')
const require = createRequire(import.meta.url)
const upstream = JSON.parse(await readFile(join(root, 'upstream.json'), 'utf8'))
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const runtimeManifest = JSON.parse(await readFile(join(root, 'runtime/package.json'), 'utf8'))
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options })
const json = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n')
const cache = join(root, '.build/official-harness')
const source = join(root, '.build/electron-source')
const app = join(root, '.build/electron-app')
const resources = join(root, '.build/electron-resources')
const output = join(root, 'dist/electron')

await mkdir(join(root, '.build'), { recursive: true })
if (!existsSync(cache)) run('git', ['clone', '--depth', '1', '--branch', upstream.tag, upstream.repository, cache])
assert.equal(run('git', ['rev-parse', 'HEAD'], { cwd: cache, stdio: 'pipe', encoding: 'utf8' }).trim(), upstream.commit)
assert.equal(run('git', ['status', '--porcelain'], { cwd: cache, stdio: 'pipe', encoding: 'utf8' }).trim(), '', 'Cached upstream source must stay clean')
await rm(source, { recursive: true, force: true })
for (const name of ['desktop', 'desktop-host']) {
  await cp(join(cache, 'apps', name), join(source, 'apps', name), { recursive: true })
}
// 源码辅助脚本从已锁定 npm 运行树解析 Host 包，工具仍从根 node_modules 解析。
await symlink(join(root, 'runtime/node_modules'), join(source, 'node_modules'), windows ? 'junction' : 'dir')
await patchDesktop(source, runtimeManifest.dependencies['owndsh-plugin'])
await cp(join(root, 'credential-lock.mjs'), join(source, 'apps/desktop/src/credential-lock.mjs'))
await rm(app, { recursive: true, force: true })
await mkdir(app, { recursive: true })
await cp(join(root, 'runtime/node_modules'), join(app, 'node_modules'), {
  recursive: true, dereference: true,
  filter: path => !path.split(/[\\/]/).includes('.bin'),
})
// 所有核心包必须来自同一 Harness 发布，防止 npm 带入第二套 Host 单例。
const sharedNames = []
for (const name of await readdir(join(app, 'node_modules/@deepseek-ai'))) {
  const pkg = JSON.parse(await readFile(join(app, 'node_modules/@deepseek-ai', name, 'package.json'), 'utf8'))
  if (name === 'dsh' || name.startsWith('dsh-')) assert.equal(pkg.version, manifest.version, `Unexpected ${pkg.name} version`)
  sharedNames.push(pkg.name)
}
assert.equal(JSON.parse(await readFile(join(app, 'node_modules/owndsh-plugin/package.json'), 'utf8')).version, '0.1.0-beta.8')
const sourceDesktop = join(source, 'apps/desktop')
const sourceHost = join(source, 'apps/desktop-host')
await mkdir(join(sourceDesktop, '.desktop-build'), { recursive: true })
await mkdir(join(root, '.build/primary-downloads'), { recursive: true })
await symlink(join(root, '.build/primary-downloads'), join(sourceDesktop, '.desktop-build/downloads'), windows ? 'junction' : 'dir')
const compile = (entry, outfile, format = 'esm') => build({
  entryPoints: [entry], outfile, bundle: true, platform: 'node', format, target: 'es2024',
  packages: 'external', tsconfigRaw: {}, logLevel: 'info',
})
await compile(join(sourceDesktop, 'src/main.ts'), join(app, 'lib/main.js'))
for (const name of ['preload-app', 'preload-mandatory', 'preload-update-dialog']) {
  await compile(join(sourceDesktop, 'src', `${name}.ts`), join(app, 'lib', `${name}.cjs`), 'cjs')
}
const privateHost = join(app, 'node_modules/@deepseek-ai/dsh-desktop-host')
await mkdir(privateHost, { recursive: true })
await json(join(privateHost, 'package.json'), { name: '@deepseek-ai/dsh-desktop-host', version: manifest.version, private: true, type: 'module', main: 'lib/index.js' })
await compile(join(sourceHost, 'src/index.ts'), join(privateHost, 'lib/index.js'))
sharedNames.push('@deepseek-ai/dsh-desktop-host')
const bridge = join(app, 'node_modules/@owndsh/desktop-bridge')
await mkdir(bridge, { recursive: true })
await cp(join(root, 'plugin-bridge.mjs'), join(bridge, 'index.mjs'))
await json(join(bridge, 'package.json'), { name: '@owndsh/desktop-bridge', version: manifest.version, type: 'module', main: 'index.mjs', private: true })
await writeFile(join(app, 'owndsh-desktop.patch.yml'), "- insert:\n    - id: owndsh-desktop-bridge\n      name: '@owndsh/desktop-bridge'\n- id: owndsh\n  inject: [desktopProfiles, desktopPnpm]\n")
await cp(join(sourceDesktop, 'renderer'), join(app, 'renderer'), { recursive: true })
await cp(join(cache, 'LICENSE'), join(app, 'HARNESS-LICENSE'))
await cp(join(cache, 'THIRD_PARTY_NOTICES.md'), join(app, 'HARNESS-THIRD-PARTY-NOTICES.md'))
await cp(join(root, 'LICENSE'), join(app, 'LICENSE'))
await json(join(app, 'package.json'), {
  name: 'owndsh-official-desktop', version: manifest.version, private: true, type: 'module',
  description: manifest.description, author: 'OwnDsh contributors', license: manifest.license, main: 'lib/main.js',
  dependencies: { ...runtimeManifest.dependencies, '@deepseek-ai/dsh-desktop-host': manifest.version, '@owndsh/desktop-bridge': manifest.version },
})
// 复用官方带哈希的 Python/Node/Office 下载锁及其 smoke，不裁掉 Desktop 功能。
await compile(join(sourceDesktop, 'scripts/prepare-primary-runtime.ts'), join(sourceDesktop, 'scripts/prepare-primary-runtime.mjs'))
run(process.execPath, [join(sourceDesktop, 'scripts/prepare-primary-runtime.mjs')])
const target = `${windows ? 'win' : 'mac'}-${process.arch}`
await rm(resources, { recursive: true, force: true })
await cp(join(sourceDesktop, '.desktop-build/targets', target, 'runtime'), resources, { recursive: true, dereference: true })
await cp(join(root, 'runtime/node_modules/pnpm'), join(resources, 'pnpm'), { recursive: true, dereference: true })
await cp(join(sourceDesktop, 'scripts/node-bin'), join(resources, 'bin'), { recursive: true })
if (!windows) await chmod(join(resources, 'bin/node'), 0o755)

const icon = join(resources, 'icon.png')
const mask = Buffer.from('<svg width="1024" height="1024"><rect width="1024" height="1024" rx="224" fill="white"/></svg>')
const rounded = await sharp(join(root, 'assets/icon.png')).resize(1024, 1024).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
const graphic = sharp(rounded)
if (!windows) graphic.resize(840, 840).extend({ top: 92, bottom: 92, left: 92, right: 92, background: '#00000000' })
await graphic.png().toFile(icon)

const electron = require('electron')
const nodeVersion = run(electron, ['-p', 'process.versions.node'], { stdio: 'pipe', encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }).trim()
const runtimeTools = join(sourceDesktop, 'src/runtime-tree.mjs')
await compile(join(sourceDesktop, 'src/runtime-tree.ts'), runtimeTools)
const { writeDesktopRuntime, verifyDesktopRuntime } = await import(pathToFileURL(runtimeTools))
const { DESKTOP_HOST_PROTOCOL_VERSION } = await import(pathToFileURL(join(sourceDesktop, 'src/host-protocol.ts')))
// 单一 npm 树放在 app 根；官方主进程和私有 Host 都使用它，避免复制单例包。
writeDesktopRuntime(app, { schemaVersion: 1, version: manifest.version, hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
  nodeVersion, pnpmVersion: runtimeManifest.dependencies.pnpm }, sharedNames)
await verifyDesktopRuntime(app, manifest.version)
await mkdir(output, { recursive: true })
const label = `${windows ? 'windows' : 'macos'}-${process.arch}`
const lock = JSON.parse(await readFile(join(root, 'runtime/package-lock.json'), 'utf8'))
await json(join(output, `build-info-${label}.json`), {
  app: manifest.version, shell: 'official-electron', electron: manifest.devDependencies.electron,
  harness: runtimeManifest.dependencies['@deepseek-ai/dsh'], harnessCommit: upstream.commit,
  plugin: runtimeManifest.dependencies['owndsh-plugin'], pluginIntegrity: lock.packages['node_modules/owndsh-plugin'].integrity,
  node: nodeVersion, platform: process.platform, arch: process.arch,
  automaticUpdates: false, mandatoryUpdates: false,
  runtimeLockSha256: createHash('sha256').update(await readFile(join(root, 'runtime/package-lock.json'))).digest('hex'),
  sourceCommit: process.env.GITHUB_SHA ?? run('git', ['rev-parse', 'HEAD'], { stdio: 'pipe', encoding: 'utf8' }).trim(),
  sourceDirty: run('git', ['status', '--porcelain'], { stdio: 'pipe', encoding: 'utf8' }).trim() !== '',
})
if (process.argv.includes('--prepare-only')) {
  process.stdout.write(`Prepared official Desktop at ${app}\n`)
} else {
  const { build: packageApp, Platform } = await import('electron-builder')
  const artifacts = await packageApp({
    targets: (windows ? Platform.WINDOWS : Platform.MAC).createTarget(windows ? 'nsis' : 'dmg'),
    publish: 'never',
    config: {
      appId: 'com.owndsh.desktop.electron', productName: 'OwnDsh Electron',
      electronVersion: manifest.devDependencies.electron,
      directories: { app, output, buildResources: resources },
      artifactName: `OwnDsh-Electron-${manifest.version}-${label}.` + '${ext}',
      // 官方运行树已完成解析；禁止 builder 再裁剪 peer 依赖。
      beforeBuild: async () => false,
      files: ['**/*', { from: join(app, 'node_modules'), to: 'node_modules', filter: ['**/*'] }],
      // 官方 LibreOffice helper 用 spawn + programDirectory，必须保留真实目录。
      asar: false,
      extraResources: [{ from: resources, to: 'runtime' }, { from: icon, to: 'icon.png' }],
      publish: null,
      mac: { icon, identity: '-', hardenedRuntime: false, notarize: false, category: 'public.app-category.developer-tools',
        // 上游只携带 LibreOffice 库，非完整 App；内部 Mach-O 仍逐个签名。
        signIgnore: ['LibreOfficeDev\\.app$'],
      },
      dmg: { sign: false, writeUpdateInfo: false },
      win: { icon, signAndEditExecutable: true },
      nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, deleteAppDataOnUninstall: false, differentialPackage: false },
    },
  })
  const sums = []
  for (const path of artifacts.filter(path => /\.(dmg|exe)$/.test(path))) {
    sums.push(`${createHash('sha256').update(await readFile(path)).digest('hex')}  ${path.split(/[\\/]/).at(-1)}`)
  }
  assert.ok(sums.length, 'No installer produced')
  await writeFile(join(output, `SHA256SUMS-${label}.txt`), sums.join('\n') + '\n')
}
