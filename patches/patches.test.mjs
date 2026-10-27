/**
 * [INPUT]: patches/ 下全部补丁与一份临时官方 checkout
 * [OUTPUT]: 全部补丁锚点命中、登录链路被掐断且 CLI/配置头部语法正确的通过证据
 * [POS]: patches/ 的唯一验收入口；失败立即阻断构建
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, cpSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { applyPatches } from './index.mjs'
import { checkoutOfficial } from '../build/checkout.mjs'

const PLUGIN_VERSION = JSON.parse(readFileSync(join(resolve(import.meta.dirname, '..'), 'upstream.json'), 'utf8')).pluginVersion
const REPO_ROOT = resolve(import.meta.dirname, '..')

// 未显式指定时自行检出官方源码，使 CI 与本地都能独立运行。
const SOURCE = process.env.OWNDSH_OFFICIAL_SOURCE ?? await checkoutOfficial()

assert.ok(existsSync(SOURCE), 'official checkout is missing')
assert.ok(existsSync(join(SOURCE, 'apps/desktop/src/main.ts')), 'official checkout is missing apps/desktop')

// 干净副本：补丁不得污染探针 checkout。
const sandbox = mkdtempSync(join(tmpdir(), 'owndsh-patch-test-'))
cpSync(join(SOURCE, 'apps'), join(sandbox, 'apps'), { recursive: true })
mkdirSync(join(sandbox, 'packages', 'client'), { recursive: true })
cpSync(join(SOURCE, 'packages', 'client', 'ui-settings-account'),
  join(sandbox, 'packages', 'client', 'ui-settings-account'), { recursive: true })

try {
  await applyPatches(sandbox, PLUGIN_VERSION)

  const main = readFileSync(join(sandbox, 'apps/desktop/src/main.ts'), 'utf8')
  const welcomeApi = readFileSync(join(sandbox, 'apps/desktop/src/welcome-api.ts'), 'utf8')
  const projectManager = readFileSync(join(sandbox, 'apps/desktop/src/project-manager.ts'), 'utf8')

  // OWNDSH-PATCH-LOGIN-GATE：欢迎窗口判定恒为 false
  assert.ok(/needsWelcome\(authentication: WelcomeAuthentication\): boolean \{\n\s*\/\/ OWNDSH/.test(welcomeApi), 'needsWelcome gate missing')
  assert.ok(welcomeApi.includes('return false'), 'needsWelcome must always return false')
  // 登出与会话过期两处重弹回路必须删除
  assert.ok(!main.includes("previousAccountStatus === 'credential-stored' && state.status === 'signed-out'"), 'sign-out welcome loop still present')
  assert.ok(!main.includes("pendingWelcomeNotice = 'session-expired'"), 'session-expired welcome loop still present')

  // OWNDSH-PATCH-PROFILE-SEED：首次只播种 bundle；旧 profile 仍迁移 OwnDsh 管理的精确版本
  assert.ok(projectManager.includes("[...WEB_PROFILE.bundles, 'owndsh-plugin']"), 'profile seed missing')
  const seedWrite = `manifest.dependencies['owndsh-plugin'] = ${JSON.stringify(PLUGIN_VERSION)}`
  assert.equal(projectManager.split(seedWrite).length - 1, 1, 'legacy profile migration version missing')
  assert.ok(projectManager.includes('  rmSync,\n'), 'stale profile migration import missing')
  assert.ok(projectManager.includes("rmSync(installedPath, { recursive: true, force: true })"), 'stale profile plugin migration missing')

  // OWNDSH-PATCH-RUNTIME-DEPENDENCY：官方运行树携带插件
  assert.ok(projectManager.includes(`'owndsh-plugin': ${JSON.stringify(PLUGIN_VERSION)}`), 'runtime dependency missing')

  // OWNDSH-PACKAGING：未配置官方策略时跳过强制更新策略注入
  const policyEnv = readFileSync(join(sandbox, 'apps/desktop/scripts/desktop-policy-environment.mjs'), 'utf8')
  assert.ok(policyEnv.includes("if (configuredOrigin === '') return undefined"), 'policy bypass missing')

  // 官方 rc3 已提供 macOS unsigned 入口；OwnDsh 只复用其路径。
  const packageEnvironment = readFileSync(join(sandbox, 'apps/desktop/scripts/desktop-package-environment.mjs'), 'utf8')
  assert.ok(packageEnvironment.includes('localMacOSPackageEnvironment'), 'official macOS unsigned environment missing')
  const prepareDsh = readFileSync(join(sandbox, 'apps/desktop/scripts/prepare-dsh.ts'), 'utf8')
  assert.ok(prepareDsh.includes('OWNDSH-PATCH-RUNTIME-RESOLUTION'), 'runtime resolver dependency seam missing')
  assert.ok(prepareDsh.includes(`'owndsh-plugin': ${JSON.stringify(PLUGIN_VERSION)}`), 'runtime dsh dependency missing')
  const packageTarget = readFileSync(join(sandbox, 'apps/desktop/scripts/package-target.ts'), 'utf8')
  assert.ok(packageTarget.includes("package:mac:arm64:unsigned") || packageTarget.includes('localMacOSPackageEnvironment'), 'official macOS unsigned path missing')

  // OWNDSH-BRANDING：官方身份切换为 OwnDsh Desktop，并与官方安装并行。
  const builder = readFileSync(join(sandbox, 'apps/desktop/scripts/electron-builder-config.mjs'), 'utf8')
  assert.ok(builder.includes("productName: 'OwnDsh Desktop'"), 'OwnDsh product name missing')
  assert.ok(builder.includes('artifactName: `owndsh-desktop-'), 'OwnDsh artifact name missing')
  assert.ok(builder.includes("protocols: [{ name: 'OwnDsh Desktop', schemes: ['owndsh'] }]"), 'OwnDsh protocol missing')
  assert.ok(builder.includes('NSLocalNetworkUsageDescription:'), 'macOS local network usage description missing')
  assert.ok(builder.includes('output.suffix'), 'official unsigned artifact suffix missing')

  // OWNDSH-GITHUB-UPDATES：unsigned 包携带 OwnDsh GitHub Release 更新源。
  assert.ok(builder.includes("https://github.com/boe1900/owndsh-desktop/releases/latest/download"), 'OwnDsh GitHub update source missing')
  assert.ok(builder.includes("publish: update === undefined ? null : [{ provider: 'generic', url: update.publicUrl, channel: update.channel }]"), 'GitHub update feed metadata missing')

  // OWNDSH-ACCOUNT-MENU：更多菜单不再暴露官方登录和反馈入口。
  const accountMenu = readFileSync(join(sandbox, 'packages/client/ui-settings-account/src/client/AccountMenu.tsx'), 'utf8')
  assert.ok(accountMenu.includes("id: 'settings'"), 'settings menu item was removed')
  assert.ok(accountMenu.includes("id: 'signout'"), 'signed-in sign-out menu item was removed')
  assert.ok(!accountMenu.includes("id: 'contact'"), 'official feedback menu item still present')
  assert.ok(!accountMenu.includes("id: 'signin'"), 'official sign-in menu item still present')
  assert.ok(!accountMenu.includes('SignInDialog'), 'official sign-in dialog still mounted from account menu')

  const mainSource = readFileSync(join(sandbox, 'apps/desktop/src/main.ts'), 'utf8')
  assert.ok(mainSource.includes("process.env.DSH_HOME ??= join(homedir(), '.owndsh')"), 'OwnDsh home default missing')
  assert.ok(mainSource.includes("app.setPath('userData', ownDshUserData)"), 'OwnDsh userData isolation missing')
  assert.ok(mainSource.includes("setAsDefaultProtocolClient('owndsh')"), 'OwnDsh external protocol missing')
  assert.ok(mainSource.includes("url === 'owndsh://open'"), 'OwnDsh protocol wake-up missing')

  // rc3 官方 Host 已使用回环地址和操作系统分配的端口。
  const desktopHost = readFileSync(join(sandbox, 'apps/desktop-host/src/index.ts'), 'utf8')
  assert.ok(desktopHost.includes("args: ['--no-open', '--host', '127.0.0.1', '--port', '0']"), 'official Host must use isolated loopback port')

  const locale = readFileSync(join(sandbox, 'apps/desktop/src/locale.ts'), 'utf8')
  assert.ok(locale.includes("aboutProduct: 'OwnDsh Desktop'"), 'OwnDsh English locale missing')
  assert.ok(locale.includes("aboutMenu: '关于 OwnDsh Desktop'"), 'OwnDsh Chinese locale missing')

  for (const file of ['apps/desktop/src/main.ts', 'apps/desktop/src/locale.ts']) {
    const source = readFileSync(join(sandbox, file), 'utf8')
    assert.equal((source.match(/\[INPUT\]: 官方/g) ?? []).length, 1, `${file} must have one L3 header`)
  }
  assert.match(main, /标记 OWNDSH-BRANDING \+ OWNDSH-DATA-ISOLATION \+ OWNDSH-PATCH-LOGIN-GATE/)
  assert.match(locale, /标记 OWNDSH-BRANDING \+ OWNDSH-CLI-ISOLATION/)

  for (const [sourceName, targetName] of [
    ['icon-1104.png', 'icon.png'],
    ['icon-windows.png', 'icon-windows.png'],
    ['icon-macos.png', 'icon-macos.png'],
    ['tray-windows.ico', 'tray-windows.ico'],
  ]) {
    assert.deepEqual(
      readFileSync(join(sandbox, 'apps/desktop/resources', targetName)),
      readFileSync(join(REPO_ROOT, 'assets', sourceName)),
      `${targetName} was not replaced with OwnDsh artwork`,
    )
  }

  for (const name of ['.env.windows.example', '.env.macos.example']) {
    const env = readFileSync(join(sandbox, 'apps/desktop', name), 'utf8')
    assert.ok(env.includes('DSH_DESKTOP_APP_ID=com.owndsh.desktop'), `${name} OwnDsh appId missing`)
    assert.ok(env.split('\n').slice(0, 4).every(line => line.startsWith('# ')), `${name} must use environment comments`)
  }

  for (const [file, expected] of [
    ['apps/desktop/cli/owndsh.cmd', 'OwnDsh Desktop.exe'],
    ['apps/desktop/cli/owndsh', 'OwnDsh Desktop"'],
    ['apps/desktop/cli/owndsh', 'DSH_HOME'],
    ['apps/desktop/cli/owndsh', 'case "${DSH_HOME-}" in' + " '') DSH_HOME=\"$HOME/.owndsh\""],
    ['apps/desktop/cli/owndsh.cmd', 'DSH_HOME=%USERPROFILE%'],
    ['apps/desktop/scripts/prepare-cli.ts', "'owndsh.cmd' : 'owndsh'"],
    ['apps/desktop/src/command-manager-entry.ts', "/usr/local/bin/owndsh"],
    ['apps/desktop/src/command-management.ts', 'command -v owndsh'],
    ['apps/desktop/src/command-installation.ts', '.owndsh-desktop-command.json'],
    ['apps/desktop/scripts/command-path.ps1', 'Software\\OwnDsh\\Command'],
    ['apps/desktop/scripts/command-path.ps1', "'owndsh.cmd'"],
    ['apps/desktop/scripts/package-macos.ts', 'owndsh-desktop-${version}-mac-${arch}'],
    ['apps/desktop/scripts/desktop-upload-plan.ts', 'owndsh-desktop-${buildVersion}-${target.os}-${target.arch}'],
    ['apps/desktop/scripts/desktop-build-version-discovery.ts', 'owndsh-desktop-'],
  ]) {
    assert.ok(readFileSync(join(sandbox, file), 'utf8').includes(expected), `${file} OwnDsh identity missing`)
  }

  assert.equal(readFileSync(join(sandbox, 'apps/desktop/cli/owndsh'), 'utf8').split('\n', 1)[0], '#!/bin/sh', 'macOS CLI shebang must remain first')
  assert.equal(readFileSync(join(sandbox, 'apps/desktop/cli/owndsh.cmd'), 'utf8').split(/\r?\n/, 1)[0], '@echo off', 'Windows CLI echo control must remain first')
  for (const [file, start, comment] of [
    ['apps/desktop/cli/owndsh', 1, '# '],
    ['apps/desktop/cli/owndsh.cmd', 1, '@rem '],
    ['apps/desktop/scripts/command-path.ps1', 0, '# '],
  ]) {
    const lines = readFileSync(join(sandbox, file), 'utf8').split(/\r?\n/)
    assert.ok(lines.slice(start, start + 4).every(line => line.startsWith(comment)), `${file} must use native comments`)
  }
  assert.equal((readFileSync(join(sandbox, 'apps/desktop/cli/owndsh'), 'utf8').match(/\[INPUT\]: 官方/g) ?? []).length, 1, 'macOS CLI must have one L3 header')
  assert.equal((readFileSync(join(sandbox, 'apps/desktop/cli/owndsh.cmd'), 'utf8').match(/\[INPUT\]: 官方/g) ?? []).length, 1, 'Windows CLI must have one L3 header')

  assert.equal(existsSync(join(sandbox, 'apps/desktop/cli/dsh')), false, 'official macOS CLI name still present')
  assert.equal(existsSync(join(sandbox, 'apps/desktop/cli/dsh.cmd')), false, 'official Windows CLI name still present')

  console.log('owndsh: all seams verified on', PLUGIN_VERSION)
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}
