/**
 * [INPUT]: patch-desktop.mjs 的补丁函数与一份临时官方 checkout
 * [OUTPUT]: 全部补丁锚点命中且登录链路被掐断的通过证据
 * [POS]: patch-desktop.mjs 的唯一验收入口；失败立即阻断构建
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, cpSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { patchDesktop, patchNativeEntry } from './patch-desktop.mjs'
import { checkoutOfficial } from './checkout.mjs'

const PLUGIN_VERSION = '0.1.0-beta.16'

// 未显式指定时自行检出官方源码，使 CI 与本地都能独立运行。
const SOURCE = process.env.OWNDSH_OFFICIAL_SOURCE ?? await checkoutOfficial()

assert.ok(existsSync(SOURCE), 'official checkout is missing')
assert.ok(existsSync(join(SOURCE, 'apps/desktop/src/main.ts')), 'official checkout is missing apps/desktop')

// 干净副本：补丁不得污染探针 checkout。
const sandbox = mkdtempSync(join(tmpdir(), 'owndsh-patch-test-'))
cpSync(join(SOURCE, 'apps'), join(sandbox, 'apps'), { recursive: true })
cpSync(join(SOURCE, 'packages'), join(sandbox, 'packages'), { recursive: true })
cpSync(join(SOURCE, 'native'), join(sandbox, 'native'), { recursive: true })
cpSync(join(SOURCE, 'pnpm-lock.yaml'), join(sandbox, 'pnpm-lock.yaml'))

try {
  await patchDesktop(sandbox, PLUGIN_VERSION)
  await patchNativeEntry(sandbox)

  const main = readFileSync(join(sandbox, 'apps/desktop/src/main.ts'), 'utf8')
  const welcomeApi = readFileSync(join(sandbox, 'apps/desktop/src/welcome-api.ts'), 'utf8')
  const projectManager = readFileSync(join(sandbox, 'apps/desktop/src/project-manager.ts'), 'utf8')
  const manifest = JSON.parse(readFileSync(join(sandbox, 'apps/desktop/package.json'), 'utf8'))

  // OWNDSH-PATCH-DATA-ROOT
  assert.ok(main.includes('com.owndsh.desktop.electron'), 'data root patch missing')
  assert.ok(main.includes("process.env.DSH_HOME = join(ownDshHome, 'Harness')"), 'DSH_HOME patch missing')

  // OWNDSH-PATCH-LOGIN-GATE
  assert.ok(/needsWelcome\(authentication: WelcomeAuthentication\): boolean \{\n\s*\/\/ OWNDSH/.test(welcomeApi), 'needsWelcome gate missing')
  assert.ok(welcomeApi.includes('return false'), 'needsWelcome must always return false')
  assert.ok(!main.includes("previousAccountStatus === 'credential-stored' && state.status === 'signed-out'"), 'sign-out welcome loop still present')
  assert.ok(!main.includes("pendingWelcomeNotice = 'session-expired'"), 'session-expired welcome loop still present')

  // OWNDSH-PATCH-PROFILE-SEED
  assert.ok(projectManager.includes('[...WEB_PROFILE.bundles, \'owndsh-plugin\']'), 'profile seed missing')
  const seedWrite = `manifest.dependencies['owndsh-plugin'] = ${JSON.stringify(PLUGIN_VERSION)}`
  assert.ok(projectManager.includes(seedWrite), 'seed version missing')
  assert.ok(projectManager.includes('owndsh-plugin'), 'runtime dependency missing')

  // OWNDSH-PATCH-SHELL-RUNTIME
  assert.ok(['workspace:^', 'workspace:*'].includes(manifest.dependencies['@deepseek-ai/dsh-home-paths']), 'home-paths must be a production dependency')
  assert.ok(!(manifest.devDependencies?.['@deepseek-ai/dsh-home-paths']), 'home-paths must leave devDependencies')

  // OWNDSH-PATCH-WIN-TRAY
  assert.ok(main.includes('let tray: Tray | undefined'), 'tray state missing')
  assert.ok(main.includes('OWNDSH-PATCH-WIN-TRAY'), 'tray patch marker missing')

  // OWNDSH-PACKAGING
  const builder = readFileSync(join(sandbox, 'apps/desktop/scripts/electron-builder-config.mjs'), 'utf8')
  assert.ok(builder.includes("productName: 'OwnDsh Electron'"), 'product name not rebranded')
  assert.ok(builder.includes('artifactName: `OwnDsh-Electron-'), 'artifact name not rebranded')
  assert.ok(builder.includes('identity: unsigned ?'), 'macOS ad-hoc signing missing')
  assert.ok(builder.includes('notarize: !unsigned,'), 'notarize bypass missing')

  const packageTarget = readFileSync(join(sandbox, 'apps/desktop/scripts/package-target.ts'), 'utf8')
  assert.ok(!packageTarget.includes('--unsigned requires win-x64'), 'unsigned platform restriction still present')

  // OWNDSH-PACKAGING 策略跳过
  const policyEnv = readFileSync(join(sandbox, 'apps/desktop/scripts/desktop-policy-environment.mjs'), 'utf8')
  assert.ok(policyEnv.includes('if (configuredOrigin === \'\') return undefined'), 'policy bypass missing')

  console.log('patch-desktop: all seams verified on', PLUGIN_VERSION)
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}
