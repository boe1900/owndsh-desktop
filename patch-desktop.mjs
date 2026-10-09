/**
 * [INPUT]: 精确 commit 的官方 Electron Desktop 源码与 OwnDsh 插件版本
 * [OUTPUT]: 掐断官方登录链路、预置 OwnDsh 插件、独立数据目录与 Windows 托盘的发行补丁
 * [POS]: 官方源码差异的唯一入口；标记和升级检查见 OFFICIAL-DESKTOP-PATCHES.md
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * 断言式补丁：每个锚点在官方源码中必须恰好出现一次。
 * 官方升级改动了锚点上下文时立即失败，绝不放宽断言。
 * @param source - 临时官方 checkout 根目录
 * @param spec - 补丁元数据与替换对
 */
async function patch(source, spec) {
  const path = join(source, spec.file)
  let content = await readFile(path, 'utf8')
  for (const [before, after] of spec.replacements) {
    assert.equal(content.split(before).length, 2, `Official Desktop seam changed: ${spec.file}: ${before}`)
    content = content.replace(before, after)
  }
  await writeFile(path, `/**
 * [INPUT]: 官方 ${spec.file}
 * [OUTPUT]: ${spec.output}
 * [POS]: 临时构建副本；修改真源为 patch-desktop.mjs，标记 ${spec.marker}
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
${content}`)
}

/**
 * 对官方 apps/desktop 施加全部 OwnDsh 发行补丁。
 * @param source - 临时官方 checkout 根目录
 * @param pluginVersion - 预置的 owndsh-plugin 精确版本
 */
export async function patchDesktop(source, pluginVersion) {
  // OWNDSH-PATCH-SHELL-RUNTIME: 主进程运行时依赖必须进入 production closure；官方源码列为 devDependency 时，app.asar 启动会漏包。
  const desktopPackagePath = join(source, 'apps/desktop/package.json')
  const desktopManifest = JSON.parse(await readFile(desktopPackagePath, 'utf8'))
  const homePathsVersion = desktopManifest.dependencies?.['@deepseek-ai/dsh-home-paths']
    ?? desktopManifest.devDependencies?.['@deepseek-ai/dsh-home-paths']
  assert.ok(
    homePathsVersion === 'workspace:^' || homePathsVersion === 'workspace:*',
    `Official Desktop shell dependency seam changed: @deepseek-ai/dsh-home-paths (found ${String(homePathsVersion)})`,
  )
  if (desktopManifest.dependencies?.['@deepseek-ai/dsh-home-paths'] === undefined) {
    delete desktopManifest.devDependencies['@deepseek-ai/dsh-home-paths']
    desktopManifest.dependencies = {
      ...desktopManifest.dependencies,
      '@deepseek-ai/dsh-home-paths': homePathsVersion,
    }
    await writeFile(desktopPackagePath, `${JSON.stringify(desktopManifest, null, 2)}\n`)

    // lockfile 的 apps/desktop importer 必须与 package.json 同步，否则 --frozen-lockfile 失败。
    const lockPath = join(source, 'pnpm-lock.yaml')
    const lockfile = await readFile(lockPath, 'utf8')
    const importerStart = lockfile.indexOf('  apps/desktop:\n')
    const nextImporter = lockfile.slice(importerStart + 2).search(/\n  \S/u)
    const importerEnd = nextImporter < 0 ? -1 : importerStart + 2 + nextImporter
    assert.ok(importerStart >= 0 && importerEnd > importerStart, 'Official Desktop lockfile importer changed')
    const importer = lockfile.slice(importerStart, importerEnd)
    const homePathsLockEntry =
      "      '@deepseek-ai/dsh-home-paths':\n        specifier: workspace:*\n        version: link:../../packages/util/home-paths\n"
    assert.equal(importer.split(homePathsLockEntry).length, 2, 'Official Desktop lockfile dependency seam changed')
    const patchedImporter = importer
      .replace(homePathsLockEntry, '')
      .replace('    dependencies:\n', `    dependencies:\n${homePathsLockEntry}`)
    await writeFile(lockPath, `${lockfile.slice(0, importerStart)}${patchedImporter}${lockfile.slice(importerEnd)}`)
  }

  await patch(source, {
    marker: 'OWNDSH-PATCH-DATA-ROOT',
    file: 'apps/desktop/src/main.ts',
    replacements: [
      ['const ownsDesktopInstance = claimDesktopSingleInstance',
        `// OWNDSH: 与官方 Desktop 共存，Electron 数据和 Harness profile 使用独立根目录。
// OWNDSH-PATCH-DATA-ROOT: 官方升级时只检查 app.setPath/DSH_HOME 附近的初始化顺序。
const ownDshHome = process.env.OWNDSH_DESKTOP_HOME ?? join(app.getPath('appData'), 'com.owndsh.desktop.electron')
app.setPath('userData', join(ownDshHome, 'electron'))
process.env.DSH_HOME = join(ownDshHome, 'Harness')
const ownsDesktopInstance = claimDesktopSingleInstance`],
    ],
    output: '独立数据目录，与官方 Desktop 共存',
  })

  // OWNDSH-PATCH-LOGIN-GATE: 三处官方登录入口全部短路，登录完全交给 OwnDsh 插件的 shell.overlay 门禁。
  await patch(source, {
    marker: 'OWNDSH-PATCH-LOGIN-GATE',
    file: 'apps/desktop/src/welcome-api.ts',
    replacements: [
      ['export function needsWelcome(authentication: WelcomeAuthentication): boolean {\n  return !authentication.loggedIn && !authentication.hasApiKey\n}',
        `export function needsWelcome(authentication: WelcomeAuthentication): boolean {
  // OWNDSH: 登录由 OwnDsh 企业门禁接管，原生欢迎窗口永不弹出。
  void authentication
  return false
}`],
    ],
    output: '禁用官方欢迎窗口判定',
  })

  await patch(source, {
    marker: 'OWNDSH-PATCH-LOGIN-GATE',
    file: 'apps/desktop/src/main.ts',
    replacements: [
      // 登出后不再回到欢迎窗口：企业会话失效由插件的 shell.overlay 重新阻断。
      [`          if (previousAccountStatus === 'credential-stored' && state.status === 'signed-out') {
            void readWelcomeState().then(async (value) => {
              if (needsWelcome(value) && !quitting) {
                enteredWorkspace = false
                await showWelcome()
                if (welcomeWindow !== undefined && !welcomeWindow.isDestroyed()) welcomeWindow.webContents.send(WELCOME_IPC.state, state)
              }
              return undefined
            }).catch(() => undefined)
          }
`,
        `          // OWNDSH: 官方账号登出不弹欢迎窗口；企业会话失效由插件门禁处理。
          void previousAccountStatus
`],
      // 会话过期回调不再弹欢迎窗口。
      [`        }, () => {
          void readWelcomeState().then(async (value) => {
            if (!needsWelcome(value) || quitting) return
            pendingWelcomeNotice = 'session-expired'
            enteredWorkspace = false
            await showWelcome()
            const state = await accountBackend.state()
            if (welcomeWindow !== undefined && !welcomeWindow.isDestroyed()) welcomeWindow.webContents.send(WELCOME_IPC.state, state)
          }).catch(() => undefined)
        }, (enabled) => { analyticsEnabled = enabled })`,
        `        }, () => {
          // OWNDSH: 会话过期不弹欢迎窗口；插件读取同一账号流并自行重新阻断。
        }, (enabled) => { analyticsEnabled = enabled })`],
    ],
    output: '掐断登出与会话过期的欢迎窗口回路',
  })

  await patch(source, {
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

  // OWNDSH-PATCH-WIN-TRAY: Windows 关闭窗口隐藏到托盘，退出仍走官方生命周期。
  await patch(source, {
    marker: 'OWNDSH-PATCH-WIN-TRAY',
    file: 'apps/desktop/src/main.ts',
    replacements: [
      ['  nativeTheme,\n', '  nativeTheme,\n  nativeImage,\n  Tray,\n'],
      ['  let welcomeWindow: BrowserWindow | undefined\n', '  let welcomeWindow: BrowserWindow | undefined\n  let tray: Tray | undefined\n'],
      [`    window.on('focus', automaticCheck)
`,
        `    window.on('focus', automaticCheck)
    // OWNDSH-PATCH-WIN-TRAY: Windows 关闭窗口只隐藏到托盘，退出仍走官方生命周期。
    window.on('close', (event) => {
      if (process.platform === 'win32' && tray !== undefined && !tray.isDestroyed() && !quitting && !shuttingDown && !recovery.active) {
        event.preventDefault()
        window.hide()
      }
    })
`],
      [`  if (app.isPackaged || process.env.DSH_DESKTOP_DEV_APP === '1') app.setAsDefaultProtocolClient('dsh')`,
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
  if (app.isPackaged || process.env.DSH_DESKTOP_DEV_APP === '1') app.setAsDefaultProtocolClient('dsh')`],
    ],
    output: 'Windows 系统托盘',
  })

  await patch(source, {
    marker: 'OWNDSH-PACKAGING',
    file: 'apps/desktop/scripts/electron-builder-config.mjs',
    replacements: [
      // 应用身份：与官方 Desktop 分别安装，互不覆盖数据。
      ["    productName: 'DeepSeek Harness',",
        "    // OWNDSH-PACKAGING: 独立安装身份，与官方应用分别安装。\n    productName: 'OwnDsh Electron',"],
      ['    artifactName: `deepseek-harness-\\${version}-\\${os}-\\${arch}${unsigned ? \'-unsigned\' : \'\'}.\\${ext}`,',
        "    artifactName: `OwnDsh-Electron-\\${version}-\\${os}-\\${arch}${unsigned ? '-unsigned' : ''}.\\${ext}`,"],
      // 社区 unsigned 包：macOS ad-hoc 签名、跳过公证，仍保留官方全部构建与校验。
      ['      identity: macOSSigning?.signingIdentity,', "      identity: unsigned ? '-' : macOSSigning?.signingIdentity,"],
      ['      forceCodeSigning: true,', '      forceCodeSigning: !unsigned,'],
      ['      hardenedRuntime: true,', '      hardenedRuntime: !unsigned,'],
      ['      notarize: true,', '      notarize: !unsigned,'],
      ['    dmg: {\n      sign: true,', '    dmg: {\n      sign: !unsigned,'],
    ],
    output: 'OwnDsh 独立安装身份与社区签名方式',
  })

  await patch(source, {
    marker: 'OWNDSH-PACKAGING',
    file: 'apps/desktop/scripts/desktop-policy-environment.mjs',
    replacements: [
      // 社区包没有官方强制更新策略服务；origin 未配置时返回 undefined，
      // builder config 的 beforePack 会跳过策略注入，app 不内置假 origin。
      [`  const name = deployment === 'test' ? 'DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN' : 'DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN'\n  const selected = origin(environment[name], name)`,
        `  const name = deployment === 'test' ? 'DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN' : 'DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN'\n  // OWNDSH-PACKAGING: 社区包不内置官方强制更新策略；origin 未配置时跳过策略注入。\n  const configuredOrigin = environment[name]?.trim() ?? ''\n  if (configuredOrigin === '') return undefined\n  const selected = origin(configuredOrigin, name)`],
    ],
    output: '未配置官方策略时不注入强制更新策略',
  })

  await patch(source, {
    marker: 'OWNDSH-PACKAGING',
    file: 'apps/desktop/scripts/package-target.ts',
    replacements: [
      // 社区包扩展官方 unsigned 模式到 macOS；仍执行官方完整构建、运行树校验与 smoke。
      ["  if (values.unsigned && name !== 'win-x64') throw new Error('desktop package: --unsigned requires win-x64')\n", ''],
      ["  if (values.unsigned && values['prepare-only']) throw new Error('desktop package: --unsigned cannot use --prepare-only')\n", ''],
      ["    if (target.platform === 'darwin') {", "    // OWNDSH-PACKAGING: 社区包不使用官方 Developer ID/keychain。\n    if (target.platform === 'darwin' && !invocation.unsigned) {"],
    ],
    output: '官方 package-target 的社区 unsigned 发行入口',
  })
}

/**
 * 目标平台只携带当前架构的 native/system optional 包。
 * @param source - 临时官方 checkout 根目录
 */
export async function patchNativeEntry(source) {
  // OWNDSH-PACKAGING: 官方 entry manifest 面向发布仓库声明全部平台；本地构建时关闭跨平台 optional 包。
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
