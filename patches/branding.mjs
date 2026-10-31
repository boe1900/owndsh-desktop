/**
 * [INPUT]: 官方 Electron 打包配置、桌面壳身份文本与 OwnDsh 图标派生资源
 * [OUTPUT]: 使用 OwnDsh Desktop 名称、协议、appId 默认值、unsigned 稳定签名要求、图标和 macOS 本地网络用途声明的官方 checkout
 * [POS]: patches/ 的品牌接缝；不修改官方业务逻辑，资源由仓库内 OwnDsh 图标复制
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { copyFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { applyPatch } from './apply.mjs'

const REPO_ROOT = resolve(import.meta.dirname, '..')

/**
 * 把 OwnDsh 的固定尺寸资源放进官方资源目录。
 * @param source - 临时官方 checkout 根目录
 */
async function copyBrandAssets(source) {
  const resources = join(source, 'apps/desktop/resources')
  for (const [name, target] of [
    ['icon-1104.png', 'icon.png'],
    ['icon-windows.png', 'icon-windows.png'],
    ['icon-macos.png', 'icon-macos.png'],
    ['tray-windows.ico', 'tray-windows.ico'],
  ]) {
    await copyFile(join(REPO_ROOT, 'assets', name), join(resources, target))
  }
}

/**
 * 施加 OwnDsh Desktop 的可见身份和平台资源补丁。
 * @param source - 临时官方 checkout 根目录
 */
export async function branding(source) {
  await applyPatch(source, {
    marker: 'OWNDSH-BRANDING',
    file: 'apps/desktop/scripts/electron-builder-config.mjs',
    replacements: [
      [`    protocols: [{ name: 'DeepSeek Harness', schemes: ['dsh'] }],`,
        `    protocols: [{ name: 'OwnDsh Desktop', schemes: ['owndsh'] }],`],
      [`    productName: 'DeepSeek Harness',`, `    productName: 'OwnDsh Desktop',`],
      ['    artifactName: `deepseek-harness-\\${version}-\\${os}-\\${arch}${output.suffix}.\\${ext}`,',
        '    artifactName: `owndsh-desktop-\\${version}-\\${os}-\\${arch}${output.suffix}.\\${ext}`,'],
      [`      target: unsigned ? ['dmg'] : ['dmg', 'zip'],`,
        `      target: unsigned ? ['dmg', 'zip'] : ['dmg', 'zip'],`],
      [`      if (context.electronPlatformName !== 'darwin' || unsigned) return
      const appPath = join(context.appOutDir, \`\${context.packager.appInfo.productFilename}.app\`)
      if (update !== undefined) {`,
        `      if (context.electronPlatformName !== 'darwin') return
      const appPath = join(context.appOutDir, \`\${context.packager.appInfo.productFilename}.app\`)
      if (unsigned) {
        // Keep electron-builder's nested signatures; only the outer requirement must be stable for ShipIt.
        const requirement = \`=designated => identifier "\${appId}"\`
        await promisify(execFile)('/usr/bin/codesign', [
          '--force', '--sign', '-', '--options', 'runtime',
          '--entitlements', fileURLToPath(new URL('./macos-entitlements.plist', import.meta.url)),
          '--identifier', appId, '--requirements', requirement, appPath,
        ])
        await promisify(execFile)('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath])
        return
      }
      if (update !== undefined) {`],
      [`      extendInfo: { NSMicrophoneUsageDescription: 'DeepSeek Harness uses your microphone to transcribe speech into message drafts.' },`,
        `      extendInfo: {
        NSMicrophoneUsageDescription: 'OwnDsh Desktop uses your microphone to transcribe speech into message drafts.',
        NSLocalNetworkUsageDescription: 'OwnDsh Desktop needs access to your local network to connect to the enterprise server.',
      },`],
    ],
    output: '官方 builder 使用 OwnDsh Desktop 产品名、协议、制品前缀和 macOS 本地网络用途声明',
  })

  await applyPatch(source, {
    marker: 'OWNDSH-BRANDING',
    file: 'apps/desktop/electron-builder.config.d.mts',
    replacements: [
      [`readonly protocols: readonly [{ readonly name: 'DeepSeek Harness'; readonly schemes: readonly ['dsh'] }]`,
        `readonly protocols: readonly [{ readonly name: 'OwnDsh Desktop'; readonly schemes: readonly ['owndsh'] }]`],
      [`readonly extendInfo: { readonly NSMicrophoneUsageDescription: string }`,
        `readonly extendInfo: {
      readonly NSMicrophoneUsageDescription: string
      readonly NSLocalNetworkUsageDescription: string
    }`],
    ],
    output: '官方 builder 类型声明与 OwnDsh 产品身份一致',
  })

  await applyPatch(source, {
    marker: 'OWNDSH-BRANDING',
    file: 'apps/desktop/src/main.ts',
    replacements: [
      [`    applicationName: 'DeepSeek Harness',`, `    applicationName: 'OwnDsh Desktop',`],
      [`  if (app.isPackaged || process.env.DSH_DESKTOP_DEV_APP === '1') app.setAsDefaultProtocolClient('dsh')`,
        `  if (app.isPackaged || process.env.DSH_DESKTOP_DEV_APP === '1') app.setAsDefaultProtocolClient('owndsh')`],
      [`    if (url === 'dsh://open' || url === 'dsh://open/') focusPrimaryWindow()`,
        `    if (url === 'owndsh://open' || url === 'owndsh://open/') focusPrimaryWindow()`],
    ],
    output: 'About 面板和外部唤醒协议使用 OwnDsh Desktop 身份',
  })

  await applyPatch(source, {
    marker: 'OWNDSH-BRANDING',
    file: 'apps/desktop/src/locale.ts',
    replacements: [
      [`  aboutMenu: 'About DeepSeek Harness',`, `  aboutMenu: 'About OwnDsh Desktop',`],
      [`  aboutProduct: 'DeepSeek Harness',`, `  aboutProduct: 'OwnDsh Desktop',`, 2],
      [`  hideApplication: 'Hide DeepSeek Harness',`, `  hideApplication: 'Hide OwnDsh Desktop',`],
      [`  quitApplication: 'Quit DeepSeek Harness',`, `  quitApplication: 'Quit OwnDsh Desktop',`],
      [`  openApplication: 'Open DeepSeek Harness',`, `  openApplication: 'Open OwnDsh Desktop',`],
      [`  quitTitle: 'Quit DeepSeek Harness?',`, `  quitTitle: 'Quit OwnDsh Desktop?',`],
      [`  startupFailed: 'DeepSeek Harness is unavailable',`, `  startupFailed: 'OwnDsh Desktop is unavailable',`],
      [`  welcomeTitle: 'DeepSeek Harness',`, `  welcomeTitle: 'OwnDsh Desktop',`, 2],
      [`  welcomeBrand: 'DeepSeek Harness',`, `  welcomeBrand: 'OwnDsh Desktop',`, 2],
      [`  welcomeTaglineBrand: 'DeepSeek Harness',`, `  welcomeTaglineBrand: 'OwnDsh Desktop',`, 2],
      [`  updateTitle: 'DeepSeek Harness Update',`, `  updateTitle: 'OwnDsh Desktop Update',`],
      [`  aboutMenu: '关于 DeepSeek Harness',`, `  aboutMenu: '关于 OwnDsh Desktop',`],
      [`  hideApplication: '隐藏 DeepSeek Harness',`, `  hideApplication: '隐藏 OwnDsh Desktop',`],
      [`  quitApplication: '退出 DeepSeek Harness',`, `  quitApplication: '退出 OwnDsh Desktop',`],
      [`  openApplication: '打开 DeepSeek Harness',`, `  openApplication: '打开 OwnDsh Desktop',`],
      [`  quitTitle: '退出 DeepSeek Harness？',`, `  quitTitle: '退出 OwnDsh Desktop？',`],
      [`  startupFailed: 'DeepSeek Harness 无法使用',`, `  startupFailed: 'OwnDsh Desktop 无法使用',`],
      [`  updateTitle: 'DeepSeek Harness 更新',`, `  updateTitle: 'OwnDsh Desktop 更新',`],
    ],
    output: '桌面菜单、About、欢迎和更新文本使用 OwnDsh Desktop',
  })

  await applyPatch(source, {
    marker: 'OWNDSH-BRANDING',
    file: 'apps/desktop/scripts/development-app.ts',
    replacements: [
      ['      CFBundleIdentifier: `com.deepseek.harness.dev.${createHash(\'sha256\').update(options.appRoot).digest(\'hex\').slice(0, 12)}`,',
        '      CFBundleIdentifier: `com.owndsh.desktop.dev.${createHash(\'sha256\').update(options.appRoot).digest(\'hex\').slice(0, 12)}`,'],
      [`      CFBundleURLTypes: [{ CFBundleURLName: 'DeepSeek Harness', CFBundleURLSchemes: ['dsh'], CFBundleTypeRole: 'Viewer' }],`,
        `      CFBundleURLTypes: [{ CFBundleURLName: 'OwnDsh Desktop', CFBundleURLSchemes: ['owndsh'], CFBundleTypeRole: 'Viewer' }],`],
    ],
    output: 'macOS 开发应用与发行应用不注册官方协议',
  })

  for (const [file, replacements, output] of [
    ['apps/desktop/scripts/smoke-packaged-runtime.ts', [
      ["'DeepSeek Harness.app'", "'OwnDsh Desktop.app'"],
      ["'DeepSeek Harness.exe'", "'OwnDsh Desktop.exe'"],
      ["'MacOS', 'DeepSeek Harness'", "'MacOS', 'OwnDsh Desktop'"],
    ], '打包冒烟脚本定位 OwnDsh Desktop 应用'],
    ['apps/desktop/scripts/package-target.ts', [["'DeepSeek Harness.app'", "'OwnDsh Desktop.app'"]], 'macOS 目标打包定位 OwnDsh Desktop 应用并复用官方 unsigned 路径'],
    ['apps/desktop/scripts/package-macos.ts', [
      ["'DeepSeek Harness.app'", "'OwnDsh Desktop.app'"],
      ['`deepseek-harness-${version}-mac-${arch}`', '`owndsh-desktop-${version}-mac-${arch}`'],
    ], 'macOS 发行脚本使用 OwnDsh 应用和制品名'],
    ['apps/desktop/scripts/desktop-upload-plan.ts', [['`deepseek-harness-${buildVersion}-${target.os}-${target.arch}`', '`owndsh-desktop-${buildVersion}-${target.os}-${target.arch}`']], '上传计划使用 OwnDsh 制品前缀'],
    ['apps/desktop/scripts/desktop-build-version-discovery.ts', [
      ['/(?:^|\\/)deepseek-harness-(?<version>.+)-(?:mac|win)-(?:arm64|x64)(?:-unsigned|-unnotarized)?\\.(?:exe|dmg|zip)$/u', '/(?:^|\\/)owndsh-desktop-(?<version>.+)-(?:mac|win)-(?:arm64|x64)(?:-unsigned|-unnotarized)?\\.(?:exe|dmg|zip)$/u'],
      ['`${update.binaryKeyPrefix}/deepseek-harness-`', '`${update.binaryKeyPrefix}/owndsh-desktop-`'],
    ], '更新发现使用 OwnDsh 制品前缀'],
    ['apps/desktop/scripts/installed-update-distribution.ts', [['`deepseek-harness-${version}-win-x64.exe`', '`owndsh-desktop-${version}-win-x64.exe`']], '安装更新分发使用 OwnDsh 制品名'],
    ['apps/desktop/scripts/macos-notarization-proxy.ts', [["'com.deepseek.harness'", "'com.owndsh.desktop'"]], 'macOS 公证代理缓存与官方身份隔离'],
    ['apps/desktop/installer/extract-report.h', [['L"DeepSeek Harness installer: extraction failed\\r\\n"', 'L"OwnDsh Desktop installer: extraction failed\\r\\n"']], '安装器错误文本使用 OwnDsh Desktop'],
    ['apps/desktop/installer/strings.nsh', [
      ['"DeepSeek Harness could not be launched.', '"OwnDsh Desktop could not be launched.'],
      ['"无法启动 DeepSeek Harness。', '"无法启动 OwnDsh Desktop。'],
      ['"DeepSeek Harness is running.', '"OwnDsh Desktop is running.'],
      ['"DeepSeek Harness 正在运行', '"OwnDsh Desktop 正在运行'],
      ['"Choose an empty folder or the registered DeepSeek Harness installation folder.', '"Choose an empty folder or the registered OwnDsh Desktop installation folder.'],
      ['"请选择空文件夹，或 DeepSeek Harness 原来的安装目录。', '"请选择空文件夹，或 OwnDsh Desktop 原来的安装目录。'],
    ], '安装器显示 OwnDsh Desktop 文本'],
  ]) {
    await applyPatch(source, { marker: 'OWNDSH-BRANDING', file, replacements, output })
  }

  for (const file of ['.env.windows.example', '.env.macos.example']) {
    await applyPatch(source, {
      marker: 'OWNDSH-BRANDING',
      file: `apps/desktop/${file}`,
      replacements: [[`DSH_DESKTOP_APP_ID=com.deepseek.harness`, `DSH_DESKTOP_APP_ID=com.owndsh.desktop`]],
      output: '官方打包示例使用 OwnDsh Desktop appId',
    })
  }

  await applyPatch(source, {
    marker: 'OWNDSH-BRANDING',
    file: 'apps/desktop/scripts/desktop-package-environment.mjs',
    replacements: [
      ["    DSH_DESKTOP_APP_ID: 'com.deepseek.harness',", "    DSH_DESKTOP_APP_ID: 'com.owndsh.desktop',"],
    ],
    output: '官方 macOS unsigned 预设沿用 OwnDsh appId，保持旧版安装和 updater 身份一致',
  })

  await copyBrandAssets(source)
}
