/**
 * [INPUT]: 精确 commit 的官方 Electron Desktop 源码与 OwnDsh 插件版本
 * [OUTPUT]: OwnDsh 数据/profile/托盘接缝，以及官方打包入口的社区发行配置
 * [POS]: 官方源码差异的唯一入口；标记和升级检查见 OFFICIAL-DESKTOP-PATCHES.md
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function patchDesktop(source, pluginVersion) {
  async function patch(relativePath, replacements, output) {
    const path = join(source, relativePath)
    let content = await readFile(path, 'utf8')
    for (const [before, after] of replacements) {
      assert.equal(content.split(before).length, 2, `Official Desktop seam changed: ${relativePath}: ${before}`)
      content = content.replace(before, after)
    }
    await writeFile(path, `/**
 * [INPUT]: 官方 ${relativePath}
 * [OUTPUT]: ${output}
 * [POS]: 临时构建副本；修改真源为 patch-desktop.mjs
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
${content}`)
  }

  await patch('apps/desktop/src/main.ts', [
    [
      '  nativeTheme,\n',
      '  nativeTheme,\n  nativeImage,\n  Tray,\n',
    ],
    [
      "const ownsDesktopInstance = claimDesktopSingleInstance",
      `// OWNDSH: 与官方 Desktop 共存，Electron 数据和 Harness profile 使用独立根目录。
// OWNDSH-PATCH-DATA-ROOT: 官方升级时只检查 app.setPath/DSH_HOME 附近的初始化顺序。
const ownDshHome = process.env.OWNDSH_DESKTOP_HOME ?? join(app.getPath('appData'), 'com.owndsh.desktop.electron')
app.setPath('userData', join(ownDshHome, 'electron'))
process.env.DSH_HOME = join(ownDshHome, 'Harness')
const ownsDesktopInstance = claimDesktopSingleInstance`,
    ],
    [
      '  let welcomeWindow: BrowserWindow | undefined\n',
      '  let welcomeWindow: BrowserWindow | undefined\n  let tray: Tray | undefined\n',
    ],
    [
      "    window.on('focus', automaticCheck)\n",
      `    window.on('focus', automaticCheck)
    // OWNDSH-PATCH-WIN-TRAY: Windows 关闭窗口只隐藏到托盘，退出仍走官方生命周期。
    window.on('close', (event) => {
      if (process.platform === 'win32' && tray !== undefined && !tray.isDestroyed() && !quitting && !shuttingDown && !recovery.active) {
        event.preventDefault()
        window.hide()
      }
    })
`,
    ],
    [
      "      const window = welcomeWindow\n      window.once('closed', () => {\n",
      `      const window = welcomeWindow
      // OWNDSH-PATCH-WIN-TRAY: 欢迎窗口也遵循关闭到托盘，避免登录前退出行为分叉。
      window.on('close', (event) => {
        if (process.platform === 'win32' && tray !== undefined && !tray.isDestroyed() && !quitting && !shuttingDown && !recovery.active && !enteredWorkspace) {
          event.preventDefault()
          window.hide()
        }
      })
      window.once('closed', () => {
`,
    ],
    [
      "  if (app.isPackaged || process.env.DSH_DESKTOP_DEV_APP === '1') app.setAsDefaultProtocolClient('dsh')",
      `  if (process.platform === 'win32') {
    // OWNDSH-PATCH-WIN-TRAY: 托盘只负责显示/退出，窗口和 Host 生命周期仍由官方管理。
    const iconPath = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'resources', 'icon-windows.png')
    tray = new Tray(nativeImage.createFromPath(iconPath))
    tray.setToolTip('OwnDsh')
    const showWindow = (): void => { focusPrimaryWindow() }
    tray.on('click', showWindow)
    tray.on('double-click', showWindow)
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示 OwnDsh', click: showWindow },
      { type: 'separator' },
      { label: '退出 OwnDsh', click: () => { app.quit() } },
    ]))
    app.once('will-quit', () => { tray?.destroy() })
  }
  if (app.isPackaged || process.env.DSH_DESKTOP_DEV_APP === '1') app.setAsDefaultProtocolClient('dsh')`,
    ],
  ], '独立数据目录和 Windows 系统托盘')

  await patch('apps/desktop/src/project-manager.ts', [
    [
      'export function createPluginProfile(projectDir: string): void {\n  initProfile(projectDir, WEB_PROFILE.bundles)\n}',
      `export function createPluginProfile(projectDir: string): void {
  // OWNDSH-PATCH-PROFILE-SEED: 只在官方首次创建 profile 时播种；用户卸载后不复活。
  const fresh = !existsSync(join(projectDir, 'package.json'))
  initProfile(projectDir, fresh ? [...WEB_PROFILE.bundles, 'owndsh-plugin'] : WEB_PROFILE.bundles)
  if (!fresh) return
  const path = join(projectDir, 'package.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  manifest.dependencies['owndsh-plugin'] = ${JSON.stringify(pluginVersion)}
  writeJson(path, manifest)
}`,
    ],
    [
      '    dependencies: desktopCorePackageOverrides(packageSet),\n',
      `    // OWNDSH-PATCH-RUNTIME-DEPENDENCY: 官方运行树额外携带 OwnDsh 插件，profile 才能开箱即用。\n    dependencies: { ...desktopCorePackageOverrides(packageSet), 'owndsh-plugin': ${JSON.stringify(pluginVersion)} },\n`,
    ],
  ], '官方运行树携带 OwnDsh；首次 profile 只启用一次插件')

  // OWNDSH-PACKAGING: 扩展官方 unsigned 模式到 macOS；仍执行官方完整构建、运行树校验与 smoke。
  await patch('apps/desktop/scripts/package-target.ts', [
    ["  if (values.unsigned && name !== 'win-x64') throw new Error('desktop package: --unsigned requires win-x64')\n", ''],
    ["  if (values.unsigned && values['prepare-only']) throw new Error('desktop package: --unsigned cannot use --prepare-only')\n", ''],
    ["    if (target.platform === 'darwin') {\n", "    // OWNDSH-PACKAGING: 社区包不使用官方 Developer ID/keychain。\n    if (target.platform === 'darwin' && !invocation.unsigned) {\n"],
    ['    DSH_DESKTOP_TARGET_ARCH: target.arch,\n', "    DSH_DESKTOP_TARGET_ARCH: target.arch,\n    DSH_DESKTOP_UNSIGNED: invocation.unsigned ? '1' : '0',\n"],
    ["  if (target.platform === 'darwin' && !invocation.directory) {", "  if (target.platform === 'darwin' && !invocation.directory && !invocation.unsigned) {"],
    ["  } else if (target.platform === 'darwin') {", "  } else if (target.platform === 'darwin' && !invocation.unsigned) {"],
  ], '官方 package-target 的社区 unsigned 发行入口')

  await patch('apps/desktop/scripts/desktop-package-environment.mjs', [
    ['  resolveDesktopPolicyEnvironment(environment)\n', '  // OWNDSH-PACKAGING: 未配置自有更新服务的社区包无需官方服务凭据。\n  if (options.unsigned) return\n  resolveDesktopPolicyEnvironment(environment)\n'],
  ], '社区包只校验应用 ID 和 npm registry；正式签名流程保持官方实现')

  await patch('apps/desktop/scripts/prepare-dsh.ts', [
    ["    if (process.platform === 'darwin') {", "    // OWNDSH-PACKAGING: 社区包保留依赖原始字节；外层 app 由 builder 作 ad-hoc 签名。\n    if (process.platform === 'darwin' && process.env.DSH_DESKTOP_UNSIGNED !== '1') {"],
    [
      "    })\n    writeFileSync(join(DSH_OUTPUT_ROOT, 'package.json'),",
      `    })
    // OWNDSH-PATCH-ASAR-NATIVE: Electron 的 app.asar 只提供虚拟读取；原生 LO helper 必须从 app.asar.unpacked 启动。
    const officeAdapter = join(DSH_OUTPUT_ROOT, 'node_modules', '@deepseek-ai', 'libreoffice-kit', 'lib', 'index.js')
    const officeSource = readFileSync(officeAdapter, 'utf8')
    const asarPatched = officeSource.replace(
      ${JSON.stringify('\treturn path;\n}\nfunction glibcVersion')},
      ${JSON.stringify("\treturn path.replace(/\\.asar([\\\\/])/u, '.asar.unpacked$1');\n}\nfunction glibcVersion")},
    )
    if (asarPatched === officeSource) throw new Error('desktop runtime: LibreOfficeKit ASAR path seam changed')
    const officePatched = asarPatched.replace(
      ${JSON.stringify('if (platform === "linux") env.LD_LIBRARY_PATH = programDirectory;')},
      ${JSON.stringify('if (platform === "linux") env.LD_LIBRARY_PATH = programDirectory;\n\tif (platform === "win32") env.PATH = [programDirectory, source.PATH].filter((value) => value !== void 0 && value !== "").join(";");')},
    )
    if (officePatched === asarPatched) throw new Error('desktop runtime: LibreOfficeKit Windows DLL path seam changed')
    writeFileSync(officeAdapter, officePatched)
    writeFileSync(join(DSH_OUTPUT_ROOT, 'package.json'),`,
    ],
  ], '官方 dsh 准备流程支持无 Developer ID 的社区包')

  await patch('apps/desktop/scripts/macos-notarization-proxy.ts', [
    [
      "import { tryLockExclusive } from '@deepseek-ai/node-addon-system/flock'\n",
      '',
    ],
    [
      'async function withProxyLock<T>(lock: string, action: () => Promise<T>): Promise<T> {\n',
      `async function withProxyLock<T>(lock: string, action: () => Promise<T>): Promise<T> {
  // OWNDSH-PATCH-BUILD-ORDER: native flock 在官方 native/system 构建后才存在；按需加载避免干净 runner 在模块加载阶段失败。
  const { tryLockExclusive } = await import('@deepseek-ai/node-addon-system/flock')
`,
    ],
  ], '官方 macOS notarization proxy 的 native flock 按需加载')

  await patch('apps/desktop/scripts/electron-builder-config.mjs', [
    ['  const policy = resolveDesktopPolicyEnvironment(env)\n', ''],
    ["  if (unsigned && resolvedPlatform !== 'win32') throw new Error('desktop package: unsigned builds require Windows')", "  // OWNDSH-PACKAGING: 保留 updater/policy 实现；未部署自有服务时不注入更新地址。\n  const policy = unsigned ? undefined : resolveDesktopPolicyEnvironment(env)"],
    ['  const macOSSigning = packagesMacOS ? resolveMacOSSigningEnvironment(env) : undefined', '  const macOSSigning = packagesMacOS && !unsigned ? resolveMacOSSigningEnvironment(env) : undefined'],
    ['  if (packagesMacOS) resolveMacOSNotarizationEnvironment(env)', '  if (packagesMacOS && !unsigned) resolveMacOSNotarizationEnvironment(env)'],
    ["    productName: 'DeepSeek Harness',", "    // OWNDSH-PACKAGING: 独立安装身份，与官方应用分别安装。\n    productName: 'OwnDsh Electron',"],
    ["    artifactName: 'deepseek-harness-${version}-${os}-${arch}.${ext}',", "    artifactName: 'OwnDsh-Electron-${version}-${os}-${arch}.${ext}',"],
    ['      dshDesktopAppId: appId,', "      name: 'owndsh-desktop-electron',\n      dshDesktopAppId: appId,"],
    ['      identity: macOSSigning?.signingIdentity,', "      identity: unsigned ? '-' : macOSSigning?.signingIdentity,"],
    ['      forceCodeSigning: true,', '      forceCodeSigning: !unsigned,'],
    ['      hardenedRuntime: true,', '      hardenedRuntime: !unsigned,'],
    ['      notarize: true,', '      notarize: !unsigned,'],
    ['      sign: true,', '      sign: !unsigned,'],
    ["      if (context.electronPlatformName !== 'darwin') return", "      if (context.electronPlatformName !== 'darwin' || unsigned) return"],
    ["      if (!artifact.file.endsWith('.dmg')) return", "      if (unsigned || !artifact.file.endsWith('.dmg')) return"],
  ], '复用官方 builder 配置，设置 OwnDsh 身份和社区签名方式')

  await patch('apps/desktop/scripts/smoke-packaged-runtime.ts', [
    ["if (values.unsigned && !windows) throw new Error('desktop smoke: unsigned artifacts require Windows')\n", '// OWNDSH-PACKAGING: 三平台社区包继续执行官方安装包运行验收。\n'],
    ["'DeepSeek Harness.app'", "'OwnDsh Electron.app'"],
    ["'DeepSeek Harness.exe'", "'OwnDsh Electron.exe'"],
    ["'MacOS', 'DeepSeek Harness'", "'MacOS', 'OwnDsh Electron'"],
  ], '官方安装包 smoke 使用 OwnDsh 可执行文件名')

}

export async function patchNativeEntry(source) {
  // OWNDSH-PACKAGING: 目标包只携带当前 macOS 的 native/system optional 包。
  // 官方 entry manifest 面向发布仓库声明全部平台；pnpm pack 在本地构建时会解析
  // 全部 workspace 协议，关闭跨平台 optional 包会因此失败。构建入口会在官方 install
  // 前调用本函数，并同步临时 lockfile 的 importer。
  const nativeEntry = join(source, 'native/system/packages/entry/package.json')
  const nativeManifest = JSON.parse(await readFile(nativeEntry, 'utf8'))
  const platformDirectory = process.platform === 'darwin' ? `darwin-${process.arch}` : undefined
  const platformPackage = platformDirectory === undefined ? undefined : `@deepseek-ai/node-addon-system-${platformDirectory}`
  nativeManifest.optionalDependencies = platformPackage === undefined ? {} : { [platformPackage]: 'workspace:*' }
  await writeFile(nativeEntry, `${JSON.stringify(nativeManifest, null, 2)}\n`)

  const lockPath = join(source, 'pnpm-lock.yaml')
  const lockfile = await readFile(lockPath, 'utf8')
  const start = lockfile.indexOf('  native/system/packages/entry:')
  const end = lockfile.indexOf('\n\n  ', start)
  assert.ok(start >= 0 && end > start, 'Official lockfile native entry importer changed')
  const importer = platformPackage === undefined
    ? '  native/system/packages/entry: {}'
    : `  native/system/packages/entry:\n    optionalDependencies:\n      '${platformPackage}':\n        specifier: workspace:*\n        version: link:../${platformDirectory}`
  await writeFile(lockPath, `${lockfile.slice(0, start)}${importer}${lockfile.slice(end)}`)
}
