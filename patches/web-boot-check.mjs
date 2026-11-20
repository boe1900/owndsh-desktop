/**
 * [INPUT]: 已施加发行补丁的官方 Web 入口源码与可控 Desktop IPC。
 * [OUTPUT]: 执行真实入口，验证装配所有权、延迟启动、远端流地址和失败隔离。
 * [POS]: patches 的 Web 启动行为验收，由 patches.test.mjs 复用同一官方沙箱调用。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { stripTypeScriptTypes } from 'node:module'
import { setImmediate } from 'node:timers/promises'
import { test } from 'node:test'
import { createContext, runInContext } from 'node:vm'

const REMOTE_PATH = '/enterprise/remote/views/1ea31969-eb17-4864-8b68-2f492b3bcd4d/'
const HOST_ORIGIN = 'http://127.0.0.1:41921/'

function frame(source, { pathname = REMOTE_PATH, desktop = true, served = true } = {}) {
  const ipc = Promise.withResolvers()
  const gate = Promise.withResolvers()
  if (served) gate.resolve()
  const loader = { registrations: new Map(), load(value) { this.registrations.set(value.id, value) } }
  const state = { injections: 0, snapshots: [], failures: [], fatal: [] }
  const globals = {
    URL, Promise, console,
    location: { pathname },
    __DSH_BOOT_READY__: gate,
    __ModuleLoader__: loader,
    document: {
      getElementById: () => ({}),
      createElement: () => ({}),
      head: { append: script => script.onload() },
    },
    dshDesktopBoot: desktop ? {
      ready: () => ipc.promise,
      failed: async message => { state.fatal.push(message) },
    } : undefined,
    AppWebEntry: class {
      async run(onFailure) {
        try {
          await globals.__DSH_BOOT_READY__?.promise
          state.snapshots.push({ transport: globals.__DSH_TRANSPORT__, loader: globals.__ModuleLoader__ })
        } catch (error) {
          state.failures.push(String(error))
          onFailure?.(error)
        }
      }
    },
    applyIndexInjections: async (_injections, loadBundle) => {
      state.injections++
      globals.__ModuleLoader__ = { registrations: new Map(), load(value) { this.registrations.set(value.id, value) } }
      await loadBundle('plugins/bootstrap.js')
    },
  }
  const script = stripTypeScriptTypes(source.replace(/^import .*$/gm, ''), { mode: 'strip' })
  runInContext(script, createContext(globals), { filename: 'apps/web/src/main.ts' })
  return { globals, ipc, gate, loader, state }
}

export async function verifyWebBoot(source) {
  await test('served remote document waits for Desktop transport without replacing its module loader', async () => {
    const current = frame(source)
    await setImmediate()
    assert.equal(current.state.snapshots.length, 0, 'remote connection must wait for Desktop IPC')
    current.ipc.resolve({ injections: [], streamBaseUrl: HOST_ORIGIN })
    await setImmediate()
    assert.equal(current.state.injections, 0, 'Host-assembled remote HTML must not be injected twice')
    assert.equal(current.state.snapshots.length, 1)
    assert.equal(current.state.snapshots[0].loader, current.loader)
    assert.equal(current.globals.__ModuleLoader__, current.loader)
    assert.equal(current.state.snapshots[0].transport.ownsHost, false)
    assert.equal(current.state.snapshots[0].transport.streamBaseUrl, HOST_ORIGIN.slice(0, -1) + REMOTE_PATH)
    const socket = new URL('api/remote.mux', current.state.snapshots[0].transport.streamBaseUrl)
    socket.protocol = 'ws:'
    assert.equal(socket.href, HOST_ORIGIN.replace('http:', 'ws:').slice(0, -1) + REMOTE_PATH + 'api/remote.mux')
    current.globals.__ModuleLoader__.load({ id: 'late-module' })
    assert.ok(current.state.snapshots[0].loader.registrations.has('late-module'))
  })

  await test('remote Desktop IPC failure stays in the remote document without a fatal shell callback', async () => {
    const current = frame(source)
    current.ipc.reject(new Error('IPC unavailable'))
    await setImmediate()
    assert.equal(current.state.snapshots.length, 0)
    assert.deepEqual(current.state.failures, ['Error: IPC unavailable'])
    assert.deepEqual(current.state.fatal, [])
    assert.equal(current.state.injections, 0)
    assert.equal(current.globals.__ModuleLoader__, current.loader)
  })

  await test('local Desktop root still injects once and owns its Host', async () => {
    const current = frame(source, { pathname: '/', served: false })
    await setImmediate()
    assert.equal(current.state.snapshots.length, 0)
    current.ipc.resolve({ injections: [], streamBaseUrl: HOST_ORIGIN })
    await setImmediate()
    assert.equal(current.state.injections, 1)
    assert.equal(current.state.snapshots.length, 1)
    assert.equal(current.state.snapshots[0].transport.ownsHost, true)
    assert.equal(current.state.snapshots[0].transport.streamBaseUrl, HOST_ORIGIN)
    assert.deepEqual(current.state.failures, [])
  })

  await test('HTTP remote document retains its served bootstrap without Desktop IPC', async () => {
    const current = frame(source, { desktop: false })
    await setImmediate()
    assert.equal(current.state.snapshots.length, 1)
    assert.equal(current.state.snapshots[0].loader, current.loader)
    assert.equal(current.state.injections, 0)
    assert.equal(current.globals.__DSH_TRANSPORT__, undefined)
  })

  await test('invalid remote mount refuses boot instead of using the local Host', async () => {
    const current = frame(source, { pathname: '/enterprise/remote/views/invalid/' })
    current.ipc.resolve({ injections: [], streamBaseUrl: HOST_ORIGIN })
    await setImmediate()
    assert.equal(current.state.snapshots.length, 0)
    assert.equal(current.state.failures.length, 1)
    assert.match(current.state.failures[0], /remote.*(?:path|mount|document)/i)
    assert.equal(current.state.injections, 0)
    assert.deepEqual(current.state.fatal, [])
  })
}
