/**
 * [INPUT]: 官方 Electron main process 与 DSH_HOME 环境约定
 * [OUTPUT]: OwnDsh Desktop 默认使用独立 DSH_HOME、userData 和 sessionData
 * [POS]: patches/ 的本地数据接缝；保留显式 DSH_HOME 覆盖，避免与官方 Desktop 共享用户数据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { applyPatch } from './apply.mjs'

/**
 * 在 Electron 创建日志、Host 和 profile 之前固定 OwnDsh 的默认数据根。
 * @param source - 临时官方 checkout 根目录
 */
export async function dataIsolation(source) {
  await applyPatch(source, {
    marker: 'OWNDSH-DATA-ISOLATION',
    file: 'apps/desktop/src/main.ts',
    replacements: [
      [`import { join } from 'node:path'`, `import { homedir } from 'node:os'\nimport { join } from 'node:path'`],
      [`// Platform-conventional logs directory (macOS ~/Library/Logs/<name>, otherwise under userData);\n// set before ready so the first fatal report already resolves under it.\napp.setAppLogsPath()`,
        `// OWNDSH-DATA-ISOLATION: 保留显式 DSH_HOME；默认数据根与官方 Desktop 的 ~/.dsh 隔离。\nif (process.env.DSH_HOME?.trim() === '') delete process.env.DSH_HOME\nprocess.env.DSH_HOME ??= join(homedir(), '.owndsh')\nconst ownDshUserData = join(app.getPath('appData'), 'OwnDsh Desktop')\napp.setPath('userData', ownDshUserData)\napp.setPath('sessionData', ownDshUserData)\n// Platform-conventional logs directory (macOS ~/Library/Logs/<name>, otherwise under userData);\n// set before ready so the first fatal report already resolves under it.\napp.setAppLogsPath()`],
    ],
    output: 'OwnDsh 默认使用 ~/.owndsh 与独立 Electron 数据目录',
  })
}
