/**
 * [INPUT]: upstream.json 固定的官方仓库、tag 与不可变 commit
 * [OUTPUT]: 一个施加 OwnDsh 补丁前的官方源码 checkout，支持裸库复用
 * [POS]: 官方源码获取的唯一入口；build 与 test 共用，不污染本仓库历史
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const OFFICIAL = JSON.parse(readFileSync(join(REPO_ROOT, 'upstream.json'), 'utf8'))
const WORKTREE = join(REPO_ROOT, '.build', 'official-harness')
const BARE = join(REPO_ROOT, '.build', 'official-harness.git')

/** 运行子进程并在失败时抛出。 */
function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'ignore', shell: process.platform === 'win32' })
    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0) reject(new Error(`${command} ${args.join(' ')} exited ${String(code)}`))
      else resolvePromise()
    })
  })
}

/**
 * 检出 upstream.json 固定的官方源码。
 * 每次从 bare 仓库的对象新建 worktree，得到干净的官方 checkout——不依赖上次构建残留的任何状态。
 * @returns 官方 checkout 的绝对路径
 */
export async function checkoutOfficial() {
  if (!existsSync(BARE)) {
    mkdirSync(BARE, { recursive: true })
    await run('git', ['init', '--bare', BARE], REPO_ROOT)
  }
  // Official postinstall enables worktree-local Git config; a bare common config rejects that migration.
  await run('git', ['config', '--file', join(BARE, 'config'), 'core.bare', 'false'], REPO_ROOT)
  // 已有该 commit 时是 no-op，缺失时浅克隆；保证 worktree 能 checkout 到目标对象。
  await run('git', ['fetch', '--depth', '1', OFFICIAL.repository, OFFICIAL.commit], BARE)
  // 每次新建 worktree：上次构建的 node_modules 与构建产物不进入新 checkout。
  rmSync(WORKTREE, { recursive: true, force: true })
  await run('git', ['worktree', 'prune'], BARE)
  await run('git', ['worktree', 'add', '--detach', WORKTREE, OFFICIAL.commit], BARE)
  return WORKTREE
}
