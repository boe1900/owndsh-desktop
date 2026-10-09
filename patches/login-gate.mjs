/**
 * [INPUT]: 官方 welcome-api.ts 与 main.ts 的登录入口
 * [OUTPUT]: 三处官方登录入口全部短路，欢迎窗口在任何生命周期下都不再弹出
 * [POS]: patches/ 的登录掐断；登录门禁由插件的 shell.overlay 接管
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { applyPatch } from './apply.mjs'

/**
 * 掐断官方原生登录入口：欢迎窗口判定、登出回路、会话过期回路。
 * @param source - 临时官方 checkout 根目录
 */
export async function loginGate(source) {
  await applyPatch(source, {
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

  await applyPatch(source, {
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
}
