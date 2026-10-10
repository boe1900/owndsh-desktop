/**
 * [INPUT]: patches/ 下全部补丁与一份临时官方 checkout
 * [OUTPUT]: 全部补丁锚点命中且登录链路被掐断的通过证据
 * [POS]: patches/ 的唯一验收入口；失败立即阻断构建
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, cpSync, readFileSync, existsSync } from 'node:fs'
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

  // OWNDSH-PATCH-PROFILE-SEED：首次 profile 播种插件，卸载后不复活
  assert.ok(projectManager.includes("[...WEB_PROFILE.bundles, 'owndsh-plugin']"), 'profile seed missing')
  const seedWrite = `manifest.dependencies['owndsh-plugin'] = ${JSON.stringify(PLUGIN_VERSION)}`
  assert.ok(projectManager.includes(seedWrite), 'seed version missing')

  // OWNDSH-PATCH-RUNTIME-DEPENDENCY：官方运行树携带插件
  assert.ok(projectManager.includes(`'owndsh-plugin': ${JSON.stringify(PLUGIN_VERSION)}`), 'runtime dependency missing')

  // OWNDSH-PACKAGING：未配置官方策略时跳过强制更新策略注入
  const policyEnv = readFileSync(join(sandbox, 'apps/desktop/scripts/desktop-policy-environment.mjs'), 'utf8')
  assert.ok(policyEnv.includes("if (configuredOrigin === '') return undefined"), 'policy bypass missing')

  // OWNDSH-MAC-UNSIGNED：公开构建不依赖 Apple Developer 凭据，签名发行路径仍保留。
  const packageEnvironment = readFileSync(join(sandbox, 'apps/desktop/scripts/desktop-package-environment.mjs'), 'utf8')
  assert.ok(packageEnvironment.includes('options.unsigned || options.unsignedMac'), 'macOS unsigned validation bypass missing')
  const prepareDsh = readFileSync(join(sandbox, 'apps/desktop/scripts/prepare-dsh.ts'), 'utf8')
  assert.ok(prepareDsh.includes("process.env.DSH_DESKTOP_MAC_UNSIGNED !== '1'"), 'macOS unsigned runtime signing bypass missing')
  const packageTarget = readFileSync(join(sandbox, 'apps/desktop/scripts/package-target.ts'), 'utf8')
  assert.ok(packageTarget.includes("'unsigned-mac': { type: 'boolean', default: false }"), 'macOS unsigned option missing')
  assert.ok(packageTarget.includes('invocation.unsignedMac'), 'macOS unsigned target path missing')
  assert.ok(packageTarget.includes("electronBuilderEnv.CSC_IDENTITY_AUTO_DISCOVERY = 'false'"), 'macOS unsigned signing disable missing')
  const smoke = readFileSync(join(sandbox, 'apps/desktop/scripts/smoke-packaged-runtime.ts'), 'utf8')
  assert.ok(smoke.includes("'unsigned-mac'"), 'macOS unsigned smoke option missing')

  // OWNDSH-BRANDING：官方身份切换为 OwnDsh Desktop，并与官方安装并行。
  const builder = readFileSync(join(sandbox, 'apps/desktop/scripts/electron-builder-config.mjs'), 'utf8')
  assert.ok(builder.includes("productName: 'OwnDsh Desktop'"), 'OwnDsh product name missing')
  assert.ok(builder.includes('artifactName: `owndsh-desktop-'), 'OwnDsh artifact name missing')
  assert.ok(builder.includes("protocols: [{ name: 'OwnDsh Desktop', schemes: ['owndsh'] }]"), 'OwnDsh protocol missing')
  assert.ok(builderIncludesMacUnsigned(builder), 'macOS unsigned builder seam missing')

  const mainSource = readFileSync(join(sandbox, 'apps/desktop/src/main.ts'), 'utf8')
  assert.ok(mainSource.includes("process.env.DSH_HOME ??= join(homedir(), '.owndsh')"), 'OwnDsh home default missing')
  assert.ok(mainSource.includes("app.setPath('userData', ownDshUserData)"), 'OwnDsh userData isolation missing')
  assert.ok(mainSource.includes("setAsDefaultProtocolClient('owndsh')"), 'OwnDsh external protocol missing')
  assert.ok(mainSource.includes("url === 'owndsh://open'"), 'OwnDsh protocol wake-up missing')

  // OWNDSH-PORT-ISOLATION：官方与 OwnDsh 并行启动时不抢固定 WebServer 端口。
  const desktopHost = readFileSync(join(sandbox, 'apps/desktop-host/src/index.ts'), 'utf8')
  assert.ok(desktopHost.includes("args: ['--no-open', '--port', '0']"), 'OwnDsh Host must use an OS-assigned port')
  assert.ok(!desktopHost.includes("args: ['--no-open', '--port', '19387']"), 'fixed WebServer port still present')

  const locale = readFileSync(join(sandbox, 'apps/desktop/src/locale.ts'), 'utf8')
  assert.ok(locale.includes("aboutProduct: 'OwnDsh Desktop'"), 'OwnDsh English locale missing')
  assert.ok(locale.includes("aboutMenu: '关于 OwnDsh Desktop'"), 'OwnDsh Chinese locale missing')

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

  assert.equal(existsSync(join(sandbox, 'apps/desktop/cli/dsh')), false, 'official macOS CLI name still present')
  assert.equal(existsSync(join(sandbox, 'apps/desktop/cli/dsh.cmd')), false, 'official Windows CLI name still present')

  console.log('owndsh: all seams verified on', PLUGIN_VERSION)
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}

function builderIncludesMacUnsigned(builder) {
  return builder.includes("const unsignedMacOS = env.DSH_DESKTOP_MAC_UNSIGNED === '1'")
    && builder.includes('const unsigned = unsignedWindows || unsignedMacOS')
    && builder.includes('forceCodeSigning: !unsigned')
    && builder.includes('if (unsigned || !artifact.file.endsWith(\'.dmg\')) return')
}
