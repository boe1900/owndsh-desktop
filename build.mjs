/**
 * [INPUT]: upstream.json 固定的官方 commit、patch-desktop.mjs 的补丁、目标平台的官方构建脚本
 * [OUTPUT]: 临时官方 checkout 施加 OwnDsh 补丁后调用官方原生构建流水线，产出 OwnDsh Electron 安装包
 * [POS]: 发行构建的唯一编排入口；不复制官方业务源码，所有差异由 patch-desktop.mjs 重现
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { patchDesktop, patchNativeEntry } from './patch-desktop.mjs'

const ROOT = resolve(import.meta.dirname)
const OFFICIAL = JSON.parse(readFileSync(join(ROOT, 'upstream.json'), 'utf8'))
const PLUGIN_VERSION = process.env.OWNDSH_PLUGIN_VERSION ?? JSON.parse(
  readFileSync(join(ROOT, 'runtime.json'), 'utf8'),
).pluginVersion

const WORKTREE = join(ROOT, '.build', 'official-harness')

/** 以裸库方式检出官方源码，避免污染本仓库历史。 */
async function checkoutOfficial() {
  if (!existsSync(WORKTREE)) {
    const bare = join(ROOT, '.build', 'official-harness.git')
    await run('git', ['init', '--bare', bare], ROOT)
    await run('git', ['fetch', '--depth', '1', OFFICIAL.repository, OFFICIAL.commit], bare)
    await run('git', ['worktree', 'add', '--detach', WORKTREE, OFFICIAL.commit], bare)
  }
  return WORKTREE
}

/** 运行子进程并在失败时抛出带阶段名的错误。 */
function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0) reject(new Error(`${command} ${args.join(' ')} exited ${String(code)}`))
      else resolvePromise()
    })
  })
}

async function main() {
  assert.ok(PLUGIN_VERSION !== undefined, 'runtime.json or OWNDSH_PLUGIN_VERSION must set the plugin version')
  const target = process.env.DSH_DESKTOP_TARGET ?? 'win-x64'
  const source = await checkoutOfficial()

  console.log(`owndsh-desktop: patching official ${OFFICIAL.tag} (${OFFICIAL.commit.slice(0, 10)})`)
  await patchDesktop(source, PLUGIN_VERSION)
  await patchNativeEntry(source)

  const desktopDir = join(source, 'apps/desktop')
  console.log(`owndsh-desktop: official build for ${target}`)
  await run('pnpm', ['install', '--frozen-lockfile'], source)
  await run('pnpm', ['--filter', '@deepseek-ai/dsh-desktop', 'run', 'prepare:runtime'], source)
  await run('pnpm', ['--filter', '@deepseek-ai/dsh-desktop', 'run', 'package:win:x64:unsigned'], source)

  const buildInfo = {
    upstream: OFFICIAL,
    pluginVersion: PLUGIN_VERSION,
    target,
    builtAt: new Date().toISOString(),
  }
  const infoPath = join(desktopDir, 'build-info-official.json')
  writeFileSync(infoPath, `${JSON.stringify(buildInfo, undefined, 2)}\n`)
  console.log('owndsh-desktop: build complete', infoPath)
}

await main()
