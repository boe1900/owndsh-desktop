/**
 * [INPUT]: 依赖 npm 锁定 Pake/Harness/插件、仓库品牌资源与目标平台 Node/Rust 工具链
 * [OUTPUT]: 生成带内置运行环境的 macOS DMG 或 Windows NSIS 安装包、版本清单与 SHA-256
 * [POS]: 独立桌面仓库的发行编排器，仅在 .build/dist 生成第三方副本
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { cp, mkdir, readFile, readdir, writeFile, chmod, rm, symlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const windows = process.platform === 'win32'
const stage = join(root, '.build', 'pake')
const tauriRoot = join(stage, 'src-tauri')
const runtime = join(stage, 'runtime')
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const sharp = createRequire(join(root, 'node_modules/pake-cli/package.json'))('sharp')
const run = (file, args, cwd = root) => execFileSync(file, args, { cwd, stdio: 'inherit' })
const json = async (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
assert.ok(['darwin', 'win32'].includes(process.platform), 'Build on native macOS or Windows runners')
assert.ok(windows ? process.arch === 'x64' : ['x64', 'arm64'].includes(process.arch), 'Unsupported architecture')
assert.equal(process.version, 'v24.14.1', 'Build with Node 24.14.1 so the embedded runtime is reproducible')

await mkdir(stage, { recursive: true })
await cp(join(root, 'node_modules', 'pake-cli', 'src-tauri'), tauriRoot, { recursive: true, verbatimSymlinks: true })
await rm(runtime, { recursive: true, force: true })
await mkdir(runtime, { recursive: true })
await cp(join(root, 'runtime', 'node_modules'), join(runtime, 'node_modules'), { recursive: true, verbatimSymlinks: true })
await cp(join(root, 'runtime', 'package.json'), join(runtime, 'package.json'))
await cp(join(root, 'runtime', 'package-lock.json'), join(runtime, 'package-lock.json'))
await cp(join(root, 'launcher.mjs'), join(runtime, 'launcher.mjs'))
await cp(join(root, 'windows-job.mjs'), join(runtime, 'windows-job.mjs'))
await mkdir(join(runtime, 'bin'), { recursive: true })
await cp(process.execPath, join(runtime, 'bin', windows ? 'node.exe' : 'node'))
await chmod(join(runtime, 'bin', windows ? 'node.exe' : 'node'), 0o755)
await cp(join(root, 'assets/NODE-LICENSE'), join(runtime, 'NODE-LICENSE'))

for (const [name, entry] of [
  ['dsh', '@deepseek-ai/dsh/lib/bin.js'],
  ['pnpm', 'pnpm/bin/pnpm.cjs'],
]) {
  if (windows) {
    await writeFile(join(runtime, 'bin', `${name}.cmd`), `@echo off\r\n"%~dp0node.exe" "%~dp0..\\node_modules\\${entry.replaceAll('/', '\\')}" %*\r\n`)
    continue
  }
  await writeFile(join(runtime, 'bin', name), [
    '#!/bin/sh',
    'runtime_bin=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)',
    `exec "$runtime_bin/node" "$runtime_bin/../node_modules/${entry}" "$@"`,
    '',
  ].join('\n'), { mode: 0o755 })
  await chmod(join(runtime, 'bin', name), 0o755)
}

const lock = JSON.parse(await readFile(join(runtime, 'package-lock.json'), 'utf8'))
const pluginManifest = JSON.parse(await readFile(join(runtime, 'node_modules/owndsh-plugin/package.json'), 'utf8'))
await json(join(runtime, 'build-info.json'), {
  app: manifest.version,
  pake: manifest.devDependencies['pake-cli'],
  harness: JSON.parse(await readFile(join(runtime, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8')).version,
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  plugin: pluginManifest.version,
  pluginIntegrity: lock.packages['node_modules/owndsh-plugin'].integrity,
  runtimeLockSha256: createHash('sha256').update(await readFile(join(runtime, 'package-lock.json'))).digest('hex'),
  sourceCommit: process.env.GITHUB_SHA ?? 'local',
})

await cp(join(root, 'host.rs'), join(tauriRoot, 'src', 'host.rs'))
let rust = await readFile(join(tauriRoot, 'src', 'lib.rs'), 'utf8')
const replacements = [
  ['mod app;\n', 'mod app;\nmod host;\n'],
  ['.setup(move |app| {', `.setup(move |app| {
            let host = host::HarnessProcess::start(app)?;
            let mut pake_config = pake_config.clone();
            pake_config.windows[0].url = host.url.clone();
            pake_config.system_tray_path = app.path().resource_dir()?.join("tray.png").to_string_lossy().into_owned();
            app.manage(host);`],
  ['.run(move |_app, _event| {', `.run(move |_app, _event| {
            if matches!(_event, tauri::RunEvent::ExitRequested { .. }) {
                if let Some(host) = _app.try_state::<host::HarnessProcess>() {
                    host.stop();
                }
            }`],
]
for (const [before, after] of replacements) {
  assert.equal(rust.split(before).length, 2, `Pake hook changed: ${before}`)
  rust = rust.replace(before, after)
}
await writeFile(join(tauriRoot, 'src', 'lib.rs'), rust)

const setupPath = join(tauriRoot, 'src/app/setup.rs')
let setup = await readFile(setupPath, 'utf8')
for (const [before, after] of [
  ['.menu(&menu)', '.menu(&menu)\n        .tooltip("OwnDsh")\n        .show_menu_on_left_click(false)'],
  ['tray.set_icon_as_template(false)?;', 'tray.set_icon_as_template(cfg!(target_os = "macos"))?;'],
  ['"hide_app", "Hide"', '"hide_app", "隐藏窗口"'],
  ['"show_app", "Show"', '"show_app", "显示 OwnDsh"'],
  ['"quit", "Quit"', '"quit", "退出 OwnDsh"'],
]) {
  assert.equal(setup.split(before).length, 2, `Pake tray hook changed: ${before}`)
  setup = setup.replace(before, after)
}
await writeFile(setupPath, setup)

const pake = JSON.parse(await readFile(join(tauriRoot, 'pake.json'), 'utf8'))
Object.assign(pake.windows[0], {
  url: 'http://127.0.0.1', url_type: 'web', title: 'OwnDsh',
  width: 1400, height: 900, hide_title_bar: false, hide_on_close: true,
})
pake.system_tray = { macos: true, windows: true, linux: false }
await json(join(tauriRoot, 'pake.json'), pake)
await mkdir(join(stage, 'dist'), { recursive: true })
await writeFile(join(stage, 'dist', 'index.html'), '<!doctype html><html><head><title>OwnDsh</title></head><body></body></html>\n')
await json(join(stage, 'package.json'), { name: 'owndsh-pake-build', version: manifest.version, private: true })

const tauri = (args, cwd = root) => run(process.execPath, [join(root, 'node_modules/@tauri-apps/cli/tauri.js'), ...args], cwd)
const brandIcon = join(root, 'assets/icon.png')
const appIcon = join(stage, 'icon-macos.png')
// 沿用 Pake 3.16.1 的 macOS mask 尺寸；CLI 未导出该图像处理函数。
const mask = Buffer.from('<svg width="1024" height="1024"><rect width="1024" height="1024" rx="224" fill="white"/></svg>')
const rounded = await sharp(brandIcon).resize(1024, 1024).ensureAlpha()
  .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
await sharp(rounded).resize(840, 840)
  .extend({ top: 92, bottom: 92, left: 92, right: 92, background: '#00000000' }).png().toFile(appIcon)
tauri(['icon', appIcon, '--output', join(tauriRoot, 'icons')])
// 黑底白图的亮度直接转为 alpha，让 macOS 自动适配明暗菜单栏。
const silhouette = await sharp(brandIcon).resize(32, 32).greyscale().raw().toBuffer()
const trayPixels = Buffer.alloc(32 * 32 * 4)
silhouette.forEach((alpha, index) => { trayPixels[index * 4 + 3] = alpha })
await sharp(trayPixels, { raw: { width: 32, height: 32, channels: 4 } })
  .extend({ top: 2, bottom: 2, left: 2, right: 2, background: '#00000000' })
  .png().toFile(join(tauriRoot, 'icons/tray.png'))
if (windows) await sharp(brandIcon).resize(32, 32).png().toFile(join(tauriRoot, 'icons/tray.png'))
const config = JSON.parse(await readFile(join(tauriRoot, 'tauri.conf.json'), 'utf8'))
Object.assign(config, { productName: 'OwnDsh', identifier: 'com.owndsh.desktop', version: manifest.version })
config.app.trayIcon = undefined
config.bundle = {
  active: true, targets: [windows ? 'nsis' : 'app'],
  icon: [windows ? 'icons/icon.ico' : 'icons/icon.icns'],
  resources: { '../runtime/': 'runtime/', 'icons/tray.png': 'tray.png' },
  copyright: 'OwnDsh contributors. Desktop shell based on Pake (GPL-3.0-or-later).',
  shortDescription: 'DeepSeek Harness with OwnDsh',
  macOS: { minimumSystemVersion: '13.5', signingIdentity: '-', infoPlist: 'Info.plist' },
  windows: { webviewInstallMode: { type: 'embedBootstrapper', silent: true }, nsis: { installMode: 'currentUser' } },
}
await json(join(tauriRoot, 'tauri.conf.json'), config)
const capabilityPath = join(tauriRoot, 'capabilities', 'default.json')
const capability = JSON.parse(await readFile(capabilityPath, 'utf8'))
capability.remote.urls = ['http://127.0.0.1:*']
await json(capabilityPath, capability)
// 平台配置同样参与 Tauri merge，清空上游示例应用的 bundle 元数据。
await json(join(tauriRoot, 'tauri.macos.conf.json'), {})
await json(join(tauriRoot, 'tauri.windows.conf.json'), {})
await cp(join(root, 'node_modules/pake-cli/LICENSE'), join(runtime, 'PAKE-LICENSE'))
await cp(join(root, 'node_modules/pake-cli/LICENSE-EXCEPTION'), join(runtime, 'PAKE-LICENSE-EXCEPTION'))

process.stdout.write(`Prepared ${runtime}\n`)
if (!process.argv.includes('--prepare-only')) {
  tauri(['build', '--bundles', windows ? 'nsis' : 'app', '--', '--locked'], stage)
  const output = join(root, 'dist')
  await mkdir(output, { recursive: true })
  if (windows) {
    const bundle = join(tauriRoot, 'target/release/bundle/nsis')
    const installers = (await readdir(bundle)).filter(name => name.endsWith('.exe'))
    assert.equal(installers.length, 1, 'Expected one NSIS installer')
    await cp(join(bundle, installers[0]), join(output, `OwnDsh-${manifest.version}-windows-x64-setup.exe`))
  } else {
  const app = join(output, 'OwnDsh.app')
  await rm(app, { recursive: true, force: true })
  await cp(join(tauriRoot, 'target/release/bundle/macos/OwnDsh.app'), app, { recursive: true, verbatimSymlinks: true })
  const imageRoot = join(root, '.build', 'dmg')
  await rm(imageRoot, { recursive: true, force: true })
  await mkdir(imageRoot, { recursive: true })
  await symlink('/Applications', join(imageRoot, 'Applications'))
  await cp(app, join(imageRoot, 'OwnDsh.app'), { recursive: true, verbatimSymlinks: true })
  const dmg = join(output, `OwnDsh-${manifest.version}-macos-${process.arch}.dmg`)
  run('hdiutil', ['create', '-volname', 'OwnDsh', '-srcfolder', imageRoot, '-ov', '-format', 'UDZO', dmg])
  process.stdout.write(`Built ${app}\nBuilt ${dmg}\n`)
  }
  const label = `${windows ? 'windows' : 'macos'}-${process.arch}`
  await cp(join(runtime, 'build-info.json'), join(output, `build-info-${label}.json`))
  const artifacts = (await readdir(output)).filter(name => /\.(dmg|exe)$/.test(name))
  const sums = await Promise.all(artifacts.map(async name => `${createHash('sha256').update(await readFile(join(output, name))).digest('hex')}  ${name}`))
  await writeFile(join(output, `SHA256SUMS-${label}.txt`), `${sums.join('\n')}\n`)
}
