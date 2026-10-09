/**
 * [INPUT]: upstream.json 固定的官方 commit、patch-desktop.mjs 的补丁、目标平台的官方构建脚本
 * [OUTPUT]: 临时官方 checkout 施加 OwnDsh 补丁后调用官方原生构建流水线，产出 OwnDsh Electron 安装包
 * [POS]: 发行构建的唯一编排入口；不复制官方业务源码，所有差异由 patch-desktop.mjs 重现
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { patchDesktop, patchNativeEntry } from './patch-desktop.mjs'
import { checkoutOfficial, official } from './checkout.mjs'

const ROOT = resolve(import.meta.dirname)
const PLUGIN_VERSION = process.env.OWNDSH_PLUGIN_VERSION
  ?? JSON.parse(readFileSync(join(ROOT, 'runtime.json'), 'utf8')).pluginVersion

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
  const unsignedFlag = process.env.DSH_DESKTOP_UNSIGNED === '1' ? ':unsigned' : ''
  const source = await checkoutOfficial()

  console.log(`owndsh-desktop: patching official ${official.tag} (${official.commit.slice(0, 10)})`)
  await patchDesktop(source, PLUGIN_VERSION)
  await patchNativeEntry(source)

  console.log(`owndsh-desktop: official build for ${target}`)
  await run('pnpm', ['install', '--frozen-lockfile'], source)
  // package-target.ts 内部按顺序执行 build:official → prepare:runtime → prepare:dsh → 打包，
  // 单独预跑 prepare:runtime 会在工作区包构建之前执行，导致 vendor 包缺少 lib。
  await run('pnpm', ['--filter', '@deepseek-ai/dsh-desktop', 'run', `package:${target}${unsignedFlag}`], source)

  const infoPath = join(ROOT, '.build', 'build-info-official.json')
  mkdirSync(join(ROOT, '.build'), { recursive: true })
  writeFileSync(infoPath, `${JSON.stringify({
    upstream: official,
    pluginVersion: PLUGIN_VERSION,
    target,
    unsigned: unsignedFlag !== '',
    builtAt: new Date().toISOString(),
  }, undefined, 2)}\n`)
  console.log('owndsh-desktop: build complete', infoPath)
}

await main()
