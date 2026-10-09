/**
 * [INPUT]: upstream.json 固定的官方仓库、tag 与不可变 commit
 * [OUTPUT]: 一个施加 OwnDsh 补丁前的官方源码 checkout，支持裸库复用
 * [POS]: 官方源码获取的唯一入口；build 与 test 共用，不污染本仓库历史
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const ROOT = resolve(import.meta.dirname)
const OFFICIAL = JSON.parse(readFileSync(join(ROOT, 'upstream.json'), 'utf8'))
const WORKTREE = join(ROOT, '.build', 'official-harness')
const BARE = join(ROOT, '.build', 'official-harness.git')

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
 * 检出 upstream.json 固定的官方源码；已存在时直接复用。
 * @returns 官方 checkout 的绝对路径
 */
export async function checkoutOfficial() {
  if (!existsSync(WORKTREE)) {
    mkdirSync(BARE, { recursive: true })
    await run('git', ['init', '--bare', BARE], ROOT)
    await run('git', ['fetch', '--depth', '1', OFFICIAL.repository, OFFICIAL.commit], BARE)
    await run('git', ['worktree', 'add', '--detach', WORKTREE, OFFICIAL.commit], BARE)
  }
  return WORKTREE
}

/** 官方锁定信息，供构建元数据使用。 */
export const official = OFFICIAL
