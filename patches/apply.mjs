/**
 * [INPUT]: 官方源码文件与替换对（可声明期望命中次数）
 * [OUTPUT]: 施加单个补丁后的官方文件；锚点命中次数不符即失败
 * [POS]: patches/ 的共享底座；所有补丁通过它施加，升级时由它抛出锚点变化
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * 断言式补丁：每个锚点默认恰好出现一次；重复文本必须显式声明命中次数。
 * 官方升级改动了锚点上下文时立即失败，绝不放宽断言。
 * @param source - 临时官方 checkout 根目录
 * @param spec - 补丁元数据与替换对
 */
export async function applyPatch(source, spec) {
  const path = join(source, spec.file)
  let content = await readFile(path, 'utf8')
  for (const [before, after, expectedCount = 1] of spec.replacements) {
    const actualCount = content.split(before).length - 1
    assert.equal(actualCount, expectedCount, `Official Desktop seam changed: ${spec.file}: ${before}`)
    content = expectedCount === 1 ? content.replace(before, after) : content.replaceAll(before, after)
  }
  await writeFile(path, `/**
 * [INPUT]: 官方 ${spec.file}
 * [OUTPUT]: ${spec.output}
 * [POS]: 临时构建副本；修改真源为 patches/，标记 ${spec.marker}
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
${content}`)
}
