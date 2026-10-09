/**
 * [INPUT]: patches.mjs 的补丁函数与一份临时官方 checkout
 * [OUTPUT]: 全部补丁锚点命中且登录链路被掐断的通过证据
 * [POS]: patches.mjs 的唯一验收入口；失败立即阻断构建
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, cpSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { patchDesktop } from './patches.mjs'
import { checkoutOfficial, official } from './checkout.mjs'

const PLUGIN_VERSION = official.pluginVersion

// 未显式指定时自行检出官方源码，使 CI 与本地都能独立运行。
const SOURCE = process.env.OWNDSH_OFFICIAL_SOURCE ?? await checkoutOfficial()

assert.ok(existsSync(SOURCE), 'official checkout is missing')
assert.ok(existsSync(join(SOURCE, 'apps/desktop/src/main.ts')), 'official checkout is missing apps/desktop')

// 干净副本：补丁不得污染探针 checkout。
const sandbox = mkdtempSync(join(tmpdir(), 'owndsh-patch-test-'))
cpSync(join(SOURCE, 'apps'), join(sandbox, 'apps'), { recursive: true })

try {
  await patchDesktop(sandbox, PLUGIN_VERSION)

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

  // 官方身份必须保持原样：名称、appId 均不改动
  const builder = readFileSync(join(sandbox, 'apps/desktop/scripts/electron-builder-config.mjs'), 'utf8')
  assert.ok(builder.includes("productName: 'DeepSeek Harness'"), 'official product name must stay')

  console.log('owndsh: all seams verified on', PLUGIN_VERSION)
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}
