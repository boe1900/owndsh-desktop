/**
 * [INPUT]: 精确 commit 的官方 Electron Desktop 源码与 OwnDsh 插件版本
 * [OUTPUT]: 掐断官方登录链路并预置 OwnDsh 插件的发行补丁
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
 * [POS]: 临时构建副本；修改真源为 build/patches.mjs，标记 ${spec.marker}
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
}
