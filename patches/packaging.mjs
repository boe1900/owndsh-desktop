/**
 * [INPUT]: 官方 desktop-policy-environment.mjs 的强制更新策略校验
 * [OUTPUT]: 策略 origin 未配置时跳过注入，打包不再要求官方策略服务
 * [POS]: patches/ 的打包配置接缝；官方 builder 的 beforePack 本就有 policy undefined 的跳过分支
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { applyPatch } from './apply.mjs'

/**
 * 社区包没有官方强制更新策略服务；origin 未配置时返回 undefined。
 * @param source - 临时官方 checkout 根目录
 */
export async function packaging(source) {
  await applyPatch(source, {
    marker: 'OWNDSH-PACKAGING',
    file: 'apps/desktop/scripts/desktop-policy-environment.mjs',
    replacements: [
      [`  const name = deployment === 'test' ? 'DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN' : 'DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN'\n  const selected = origin(environment[name], name)`,
        `  const name = deployment === 'test' ? 'DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN' : 'DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN'\n  // OWNDSH-PACKAGING: 社区包不内置官方强制更新策略；origin 未配置时跳过策略注入。\n  const configuredOrigin = environment[name]?.trim() ?? ''\n  if (configuredOrigin === '') return undefined\n  const selected = origin(configuredOrigin, name)`],
    ],
    output: '未配置官方策略时不注入强制更新策略',
  })
}
