/**
 * [INPUT]: patches/ 下全部补丁与 upstream.json 锁定的插件版本
 * [OUTPUT]: 依次施加全部发行补丁的官方 checkout
 * [POS]: patches/ 的聚合入口；build/build.mjs 的唯一调用对象，新增补丁在此登记
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { loginGate } from './login-gate.mjs'
import { pluginSeed } from './plugin-seed.mjs'
import { packaging } from './packaging.mjs'

/**
 * 施加全部 OwnDsh 发行补丁。
 * @param source - 临时官方 checkout 根目录
 * @param pluginVersion - 预置的 owndsh-plugin 精确版本
 */
export async function applyPatches(source, pluginVersion) {
  await loginGate(source)
  await pluginSeed(source, pluginVersion)
  await packaging(source)
}
