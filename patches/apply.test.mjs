/**
 * [INPUT]: apply.mjs 与临时的 JavaScript、Shell、批处理、PowerShell 和环境配置夹具
 * [OUTPUT]: 多补丁头部折叠、旧头部迁移、脚本首行和解释器执行的回归证据
 * [POS]: patches/ 的共享底座验收；目标平台解释器检查注释不会变成命令，无需官方 checkout
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
import { applyPatch } from './apply.mjs'

const FIXTURES = [
  ['entry.mjs', "export const value = 'before'\n", '/**', ' *'],
  ['entry-cli.mjs', "#!/usr/bin/env node\nexport const value = 'before'\n", '#!/usr/bin/env node', ' *'],
  ['launcher', "#!/bin/sh\nset -eu\nprintf '%s\\n' before\n", '#!/bin/sh', '#'],
  ['launcher.cmd', '@echo off\r\nsetlocal DisableDelayedExpansion\r\necho before\r\nexit /b 0\r\n', '@echo off', '@rem'],
  ['command-path.ps1', "Write-Output 'before'\n", '# [INPUT]: 官方 command-path.ps1', '#'],
  ['.env.windows.example', 'APP_ID=before\n', '# [INPUT]: 官方 .env.windows.example', '#'],
]

async function fixture(t, file, body) {
  const root = await mkdtemp(join(tmpdir(), 'owndsh-header-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, file)
  await writeFile(path, body)
  for (const [before, after, marker] of [['before', 'middle', 'FIRST'], ['middle', 'done', 'SECOND']]) {
    await applyPatch(root, {
      file, marker, replacements: [[before, after]],
      output: '脚本注释中的 %USERPROFILE% & | < > ^ 必须保持字面量',
    })
  }
  return { root, path, content: await readFile(path, 'utf8') }
}

for (const [file, body, firstLine, comment] of FIXTURES) {
  test(`${file} keeps a single valid header across two patches`, async t => {
    const { path, content } = await fixture(t, file, body)
    assert.equal(content.split(/\r?\n/, 1)[0], firstLine)
    assert.equal((content.match(/\[INPUT\]: 官方/g) ?? []).length, 1)
    assert.match(content, /标记 FIRST \+ SECOND/)
    const headerLines = content.split(/\r?\n/).filter(line => /\[(INPUT|OUTPUT|POS|PROTOCOL)\]:/.test(line))
    assert.equal(headerLines.length, 4)
    assert.ok(headerLines.every(line => line.startsWith(`${comment} `)))
    if (file.endsWith('.cmd')) assert.ok(content.includes('%%USERPROFILE%% ^& ^| ^< ^> ^^'))
    if (file.endsWith('.mjs')) assert.equal((await import(pathToFileURL(path))).value, 'done')
    if (file.startsWith('.env')) assert.deepEqual(parseEnv(content), { APP_ID: 'done' })
  })
}

const LEGACY_HEADER = `/**
 * [INPUT]: 官方旧文件
 * [OUTPUT]: 旧补丁
 * [POS]: 临时构建副本，标记 OLD
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
`

for (const [file, body, firstLine] of FIXTURES) {
  test(`${file} replaces legacy block headers without losing markers`, async t => {
    const shebang = body.match(/^#![^\n]*\n/)?.[0] ?? ''
    const legacy = `${shebang}${LEGACY_HEADER.repeat(2)}${body.slice(shebang.length)}`
    const { content } = await fixture(t, file, legacy)
    assert.equal(content.split(/\r?\n/, 1)[0], firstLine)
    assert.equal((content.match(/\[INPUT\]: 官方/g) ?? []).length, 1)
    assert.match(content, /标记 OLD \+ FIRST \+ SECOND/)
  })
}

for (const [name, file, command, args, skip] of [
  ['Shell', 'launcher', '/bin/sh', ['launcher'], process.platform === 'win32'],
  ['Windows batch', 'launcher.cmd', process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', 'launcher.cmd'], process.platform !== 'win32'],
  ['PowerShell', 'command-path.ps1', 'powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'command-path.ps1'], process.platform !== 'win32'],
]) {
  test(`${name} executes patched scripts without header errors`, { skip }, async t => {
    const body = FIXTURES.find(([name]) => name === file)[1]
    const { root } = await fixture(t, file, body)
    const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 10_000 })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stderr, '')
    assert.equal(result.stdout.replaceAll('\r\n', '\n'), 'done\n')
  })
}
