/**
 * [INPUT]: upstream.json 固定的官方 commit、patches/ 的补丁、目标平台的官方构建脚本
 * [OUTPUT]: 临时官方 checkout 施加 OwnDsh 补丁后调用官方原生构建流水线，产出 unsigned 安装包
 * [POS]: 发行构建的唯一编排入口；不复制官方业务源码，所有差异由 patches/ 重现
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { writeFileSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { applyPatches } from '../patches/index.mjs'
import { checkoutOfficial } from './checkout.mjs'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const UPSTREAM = JSON.parse(readFileSync(join(REPO_ROOT, 'upstream.json'), 'utf8'))
const PLUGIN_VERSION = process.env.OWNDSH_PLUGIN_VERSION ?? UPSTREAM.pluginVersion

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
  assert.ok(PLUGIN_VERSION !== undefined, 'upstream.json or OWNDSH_PLUGIN_VERSION must set the plugin version')
  const target = process.env.DSH_DESKTOP_TARGET ?? 'win-x64'
  const unsignedFlag = process.env.DSH_DESKTOP_UNSIGNED === '1' ? ':unsigned' : ''
  // 官方 script 名用冒号分隔平台（package:win:x64），package-target.ts 参数用连字符（win-x64）。
  const scriptTarget = target.replaceAll('-', ':')
  const source = await checkoutOfficial()

  console.log(`owndsh-desktop: patching official ${UPSTREAM.tag} (${UPSTREAM.commit.slice(0, 10)})`)
  await applyPatches(source, PLUGIN_VERSION)

  // 官方打包要求 apps/desktop/.env.windows 存在；直接用官方 example（appId、名称、图标全部保持官方原样）。
  // 策略 origin 在 example 中为空，触发 OWNDSH-PACKAGING 补丁跳过强制更新策略注入。
  const envName = process.platform === 'win32' ? '.env.windows' : '.env.macos'
  const envExample = join(source, 'apps/desktop', `${envName}.example`)
  const envPath = join(source, 'apps/desktop', envName)
  copyFileSync(envExample, envPath)
  console.log(`owndsh-desktop: copied official ${envName}.example`)

  console.log(`owndsh-desktop: official build for ${target}`)
  await run('pnpm', ['install', '--frozen-lockfile'], source)
  // package-target.ts 内部按顺序执行 build:official → prepare:runtime → prepare:dsh → 打包，
  // 单独预跑 prepare:runtime 会在工作区包构建之前执行，导致 vendor 包缺少 lib。
  await run('pnpm', ['--filter', '@deepseek-ai/dsh-desktop', 'run', `package:${scriptTarget}${unsignedFlag}`], source)

  const infoPath = join(REPO_ROOT, '.build', 'build-info-official.json')
  mkdirSync(join(REPO_ROOT, '.build'), { recursive: true })
  writeFileSync(infoPath, `${JSON.stringify({
    upstream: UPSTREAM,
    pluginVersion: PLUGIN_VERSION,
    target,
    unsigned: unsignedFlag !== '',
    builtAt: new Date().toISOString(),
  }, undefined, 2)}\n`)
  console.log('owndsh-desktop: build complete', infoPath)
}

await main()
