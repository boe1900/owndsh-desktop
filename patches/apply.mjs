/**
 * [INPUT]: 官方源码文件与替换对（可声明期望命中次数）
 * [OUTPUT]: 施加单个补丁后的官方文件，使用目标语言的单个 L3 头部并保留脚本首行；锚点命中次数不符即失败
 * [POS]: patches/ 的共享底座；所有补丁通过它施加，升级时由它抛出锚点变化
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

const L3_HEADER = /^\/\*\*\r?\n(?: \* .*\r?\n)* \* \[PROTOCOL\]: .*\r?\n \*\/\r?\n/
const L3_LINE_HEADER = /^(?:#|@rem) \[INPUT\]: .*\r?\n(?:#|@rem) \[OUTPUT\]: .*\r?\n(?:#|@rem) \[POS\]: .*\r?\n(?:#|@rem) \[PROTOCOL\]: .*\r?\n/
const SCRIPT_FIRST_LINE = /^(?:#![^\r\n]*|@echo off)\r?\n/i

/**
 * 折叠旧块注释和目标语言的行注释；shebang 与 @echo off 必须保持首行。
 * @param content - 官方文件当前内容
 */
function stripL3Headers(content) {
  let firstLine = content.match(SCRIPT_FIRST_LINE)?.[0] ?? ''
  let body = content.slice(firstLine.length)
  const markers = []
  let header
  while ((header = body.match(L3_HEADER) ?? body.match(L3_LINE_HEADER))) {
    const marker = header[0].match(/\[POS\]: .*?标记 (.+)\r?\n/)?.[1]
    if (marker) markers.push(...marker.split(/\s*\+\s*/))
    body = body.slice(header[0].length)
  }
  // 兼容旧补丁把块注释插到 @echo off 前面的文件。
  if (firstLine === '') {
    firstLine = body.match(SCRIPT_FIRST_LINE)?.[0] ?? ''
    body = body.slice(firstLine.length)
  }
  return { firstLine, body, markers }
}

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
  const { firstLine, body, markers } = stripL3Headers(content)
  const allMarkers = [...new Set([...markers, spec.marker])].join(' + ')
  const extension = extname(spec.file)
  let comment = ' *'
  if (extension === '.cmd') comment = '@rem'
  else if (extension === '.ps1' || basename(spec.file).startsWith('.env')
    || (extension === '' && firstLine.startsWith('#!'))) comment = '#'
  const newline = firstLine.endsWith('\r\n') ? '\r\n' : '\n'
  const lines = [
    `[INPUT]: 官方 ${spec.file}`,
    `[OUTPUT]: ${spec.output}`,
    `[POS]: 临时构建副本；修改真源为 patches/，标记 ${allMarkers}`,
    '[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md',
  ]
  const header = lines.map(line => {
    // 批处理注释也会展开百分号和解析命令分隔符，必须保留为字面量。
    if (comment === '@rem') line = line.replace(/[%^&|<>]/g, character => character === '%' ? '%%' : `^${character}`)
    return `${comment} ${line}`
  }).join(newline) + newline
  await writeFile(path, `${firstLine}${comment === ' *' ? `/**\n${header} */\n` : header}${body}`)
}
