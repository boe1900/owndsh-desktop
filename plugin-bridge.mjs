/**
 * [INPUT]: beta.8 的 Desktop 命令接口、官方 profileContext 与 runPluginCommand
 * [OUTPUT]: 把企业插件安装/卸载交给官方带锁的插件命令及内置 pnpm
 * [POS]: 发行层注入 beta.8 所需服务，不修改 npm 插件或复制包管理逻辑
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { PassThrough } from 'node:stream'
import { runPluginCommand } from '@deepseek-ai/dsh-plugin-manager/operations'

export const name = 'owndsh-desktop-bridge'
export const inject = ['profileContext']

export function apply(ctx) {
  const profile = ctx.profileContext
  const controller = new AbortController()
  const pending = new Set()
  ctx.provide('desktopProfiles', { current: { name: profile.name } })
  ctx.provide('desktopPnpm', {
    runPlugin(argv, invokingDir, signal) {
      // 桥接只承接 beta.8 的两种现有操作，不暴露任意 pnpm 参数执行入口。
      const install = argv.length === 3 && argv[0] === 'add' && argv[1] === '--save-exact'
      const remove = argv.length === 2 && argv[0] === 'remove'
      const target = argv.at(-1)
      if ((!install && !remove) || typeof target !== 'string' || !target.trim() || target.startsWith('-')) {
        throw new Error('Unsupported OwnDsh desktop plugin command')
      }
      const stdout = new PassThrough()
      const stderr = new PassThrough()
      const done = runPluginCommand({ ...profile, profile: profile.name, cwd: invokingDir }, argv, {
        ...profile.packageManager, execution: 'service', outputBytes: 65536,
        signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal,
        onOutput: (text, stream) => (stream === 'stdout' ? stdout : stderr).write(text),
      }).then(result => ({ exitCode: result.exitCode, signal: null })).finally(() => {
        stdout.end(); stderr.end(); pending.delete(done)
      })
      pending.add(done)
      return { stdout, stderr, done }
    },
  })
  ctx.effect(() => async () => {
    controller.abort()
    await Promise.allSettled([...pending])
  })
}
