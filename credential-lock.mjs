/**
 * [INPUT]: 单实例 Desktop 独占的数据目录、官方凭据锁的 PID
 * [OUTPUT]: 只回收已确认死亡进程留下且未被替换的凭据锁
 * [POS]: 保留原 Pake 发行的异常退出恢复，在官方 Host 启动前执行
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { lstat, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

export async function recoverCredentialLock(home) {
  const path = join(home, '.credentials.yaml.lock')
  try {
    const before = await lstat(path)
    if (!before.isFile()) return
    const content = await readFile(path, 'utf8')
    if (!/^\d+\s*$/.test(content)) return
    const pid = Number(content)
    if (!Number.isSafeInteger(pid) || pid <= 0) return
    try { process.kill(pid, 0); return } catch (error) {
      if (error.code !== 'ESRCH') return
    }
    const after = await lstat(path)
    if (before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || await readFile(path, 'utf8') !== content) return
    await unlink(path)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
