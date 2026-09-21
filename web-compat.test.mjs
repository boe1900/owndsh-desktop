/**
 * [INPUT]: 读取 web-compat.js，并在缺少全局 Iterator 的隔离 JavaScript 上下文中执行
 * [OUTPUT]: 验证官方文档预览使用的 Iterator Helpers 可用
 * [POS]: 桌面兼容层的最小回归检查，防止 WebKit 启动阶段再次抛出 ReferenceError
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

test('web compat restores Iterator helpers when the host omits Iterator', async () => {
  const source = await readFile(new URL('./web-compat.js', import.meta.url), 'utf8')
  const context = vm.createContext({ Iterator: undefined })
  vm.runInContext(source, context)
  const values = vm.runInContext('[1, 2, 3][Symbol.iterator]().filter((value) => value > 1).toArray()', context)
  assert.deepEqual([...values], [2, 3])
  assert.equal(vm.runInContext("new Set(['a', 'b']).keys().join('/')", context), 'a/b')
})
