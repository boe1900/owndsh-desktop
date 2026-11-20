/**
 * [INPUT]: 官方 Web 入口的 Desktop IPC、已装配远端 document 与启动 gate。
 * [OUTPUT]: 保留远端模块系统，等待可信 loopback 流地址，并隔离远端启动失败。
 * [POS]: patches 的远程工作区启动接缝；只协调页面装配所有权，不改 Host wire 或 IPC 协议。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { applyPatch } from './apply.mjs'

export async function remoteWorkspace(source) {
  await applyPatch(source, {
    marker: 'OWNDSH-REMOTE-WORKSPACE',
    file: 'apps/web/src/main.ts',
    replacements: [
      [`const desktop = (globalThis as DesktopBootGlobal).dshDesktopBoot`,
        `const desktop = (globalThis as DesktopBootGlobal).dshDesktopBoot
type DesktopDocument = { kind: 'local' } | { kind: 'remote'; pathname: string }
const bootDocument: DesktopDocument = location.pathname.startsWith('/enterprise/remote/views')
  ? { kind: 'remote', pathname: location.pathname }
  : { kind: 'local' }`],
      [`  if (desktop === undefined) throw reason`,
        `  if (desktop === undefined || bootDocument.kind === 'remote') throw reason`],
      [`    const gate = (globalThis as { __DSH_BOOT_READY__?: PromiseWithResolvers<void> }).__DSH_BOOT_READY__
    if (gate === undefined) throw new Error('desktop web: boot readiness is missing')
    void desktop.ready().then(async ({ injections, streamBaseUrl }) => {
      const transport = globalThis as { __DSH_TRANSPORT__?: { ownsHost: boolean; streamBaseUrl: string } }
      transport.__DSH_TRANSPORT__ = { ownsHost: true, streamBaseUrl }
      await applyIndexInjections(injections, src => new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = src
        script.onload = () => { resolve() }
        script.onerror = () => { reject(new Error(\`desktop web: failed to load \${src}\`)) }
        document.head.append(script)
      }))
      gate.resolve()
    }).catch((error: unknown) => { gate.reject(error) })`,
        String.raw`    const boot = globalThis as { __DSH_BOOT_READY__?: PromiseWithResolvers<void> }
    const servedGate = boot.__DSH_BOOT_READY__
    const gate = bootDocument.kind === 'remote' ? Promise.withResolvers<void>() : servedGate
    if (gate === undefined) throw new Error('desktop web: boot readiness is missing')
    if (bootDocument.kind === 'remote') boot.__DSH_BOOT_READY__ = gate
    void desktop.ready().then(async ({ injections, streamBaseUrl }) => {
      const transport = globalThis as { __DSH_TRANSPORT__?: { ownsHost: boolean; streamBaseUrl: string } }
      if (bootDocument.kind === 'remote') {
        if (!/^\/enterprise\/remote\/views\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/$/.test(bootDocument.pathname)) {
          throw new Error('desktop web: invalid remote document mount')
        }
        if (servedGate === undefined) throw new Error('desktop web: remote document readiness is missing')
        await servedGate.promise
        transport.__DSH_TRANSPORT__ = { ownsHost: false, streamBaseUrl: new URL(bootDocument.pathname, streamBaseUrl).href }
      } else {
        transport.__DSH_TRANSPORT__ = { ownsHost: true, streamBaseUrl }
        await applyIndexInjections(injections, src => new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = src
          script.onload = () => { resolve() }
          script.onerror = () => { reject(new Error('desktop web: failed to load ' + src)) }
          document.head.append(script)
        }))
      }
      gate.resolve()
    }).catch((error: unknown) => { gate.reject(error) })`],
      [`void entry.run(desktop === undefined ? undefined : reportFailure)`,
        `void entry.run(desktop === undefined || bootDocument.kind === 'remote' ? undefined : reportFailure)`],
    ],
    output: '远端 document 只由 Host 装配一次，Desktop 仅补充当前 view 的可信流地址',
  })
}
