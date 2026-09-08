/**
 * [INPUT]: 依赖准备后的真实内置 Node/Harness/OwnDsh 与临时用户目录，不依赖开发机的 dsh/pnpm
 * [OUTPUT]: 验证离线播种、WebSocket、Server 持久化/单次恢复收敛、父进程断开清理与用户卸载不复活
 * [POS]: desktop 的最小真实进程回归，可同样指向安装包中的 runtime
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join, dirname, delimiter } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

const root = dirname(fileURLToPath(import.meta.url))
const runtime = process.env.OWNDSH_TEST_RUNTIME ?? join(root, '.build', 'pake', 'runtime')
const WebSocket = createRequire(join(runtime, 'package.json'))('ws')
const apiPrefix = '/enterprise/api/v1/local'
const windows = process.platform === 'win32'
const node = join(runtime, 'bin', windows ? 'node.exe' : 'node')
const environment = windows ? {
  SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec,
  USERPROFILE: process.env.USERPROFILE, APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA,
  TEMP: process.env.TEMP, TMP: process.env.TMP,
  PATH: [join(process.env.SystemRoot, 'System32'), process.env.SystemRoot].join(delimiter),
} : { HOME: process.env.HOME, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }
const versions = JSON.parse(await readFile(join(runtime, 'package.json'), 'utf8')).dependencies

async function start(home) {
  const child = spawn(node, [join(runtime, 'launcher.mjs')], {
    env: { ...environment, DSH_HOME: home },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let output = ''
  const ready = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', code => reject(new Error(`Launcher exited ${code}: ${output}`)))
    child.stderr.on('data', chunk => { output += chunk })
    child.stdout.on('data', chunk => {
      output += chunk
      const match = output.match(/OWNDSH_READY (http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+)/)
      if (match) resolve(match[1])
    })
  })
  try {
    const launchUrl = await Promise.race([
      ready,
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error(`Startup timeout: ${output}`)), 90000)
        timer.unref()
      }),
    ])
    return { child, url: new URL(launchUrl).origin, launchUrl }
  } catch (error) {
    const exited = child.exitCode === null ? once(child, 'exit') : Promise.resolve()
    child.stdin.end()
    await exited
    throw error
  }
}

async function stop(instance, home) {
  const state = JSON.parse(await readFile(join(home, 'desktop-runtime.json'), 'utf8'))
  const exited = once(instance.child, 'exit')
  instance.child.stdin.end()
  const result = await exited
  assert.equal(result[0], 0)
  assert.throws(() => process.kill(state.pid, 0), { code: 'ESRCH' })
  await assert.rejects(fetch(instance.url, { signal: AbortSignal.timeout(2000) }))
}

test('packaged runtime boots without system Node/pnpm and preserves user choices across restarts', { timeout: 180000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'OwnDsh desktop test '))
  let instance
  try {
    for (const [command, dependency] of [['dsh', '@deepseek-ai/dsh'], ['pnpm', 'pnpm']]) {
      const wrapper = join(runtime, 'bin', windows ? `${command}.cmd` : command)
      const version = windows
        ? execFileSync(environment.ComSpec, ['/d', '/s', '/c', `""${wrapper}" --version"`], { env: environment, encoding: 'utf8' })
        : execFileSync(wrapper, ['--version'], { env: environment, encoding: 'utf8' })
      assert.equal(version.trim(), versions[dependency])
    }
    instance = await start(home)
    const status = await (await fetch(`${instance.url}${apiPrefix}/status`)).json()
    assert.equal(status.data.state, 'UNCONFIGURED')
    assert.equal(status.data.platformUrl, null)
    assert.equal((await fetch(instance.url)).status, 401)
    const exchange = await fetch(instance.launchUrl, { redirect: 'manual' })
    assert.equal(exchange.status, 303)
    const cookie = exchange.headers.get('set-cookie').split(';')[0]
    const html = await (await fetch(instance.url, { headers: { cookie } })).text()
    assert.match(html, /<html/)
    assert.match(html, /owndsh-plugin/)
    const socket = new WebSocket(`${instance.url.replace('http:', 'ws:')}/api/remote.mux`, {
      headers: { cookie, origin: instance.url },
    })
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', () => reject(new Error('WebSocket did not connect')), { once: true })
    })
    socket.close()
    assert.doesNotMatch(await readFile(join(home, 'desktop.log'), 'utf8'), /[?&]token=[A-Za-z0-9_-]{43}/)
    assert.doesNotMatch(await readFile(join(home, 'desktop-runtime.json'), 'utf8'), /token/)
    const saved = await fetch(`${instance.url}${apiPrefix}/server`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ serverUrl: 'http://127.0.0.1:9' }),
    })
    assert.equal(saved.status, 200)
    await stop(instance, home)
    instance = undefined
    instance = await start(home)
    let restored
    for (let attempt = 0; attempt < 100; attempt++) {
      restored = await (await fetch(`${instance.url}${apiPrefix}/status`)).json()
      if (restored.data.platformUrl === 'http://127.0.0.1:9' && restored.data.state === 'SIGNED_OUT') break
      await delay(100)
    }
    assert.equal(restored.data.platformUrl, 'http://127.0.0.1:9')
    assert.equal(restored.data.state, 'SIGNED_OUT')
    await stop(instance, home)
    instance = undefined

    const manifestPath = join(home, 'profiles/web/package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    delete manifest.dependencies['owndsh-plugin']
    manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(name => name !== 'owndsh-plugin')
    await writeFile(manifestPath, JSON.stringify(manifest))
    await rm(join(home, 'profiles/web/node_modules/owndsh-plugin'), { recursive: true })
    instance = await start(home)
    const after = JSON.parse(await readFile(manifestPath, 'utf8'))
    assert.equal(after.dependencies['owndsh-plugin'], undefined)
    await stop(instance, home)
    instance = undefined
  } catch (error) {
    const log = await readFile(join(home, 'desktop.log'), 'utf8').catch(() => '')
    error.message += `\nHarness log:\n${log.slice(-16000)}`
    throw error
  } finally {
    if (instance?.child.exitCode === null) {
      const exited = once(instance.child, 'exit')
      instance.child.stdin.end()
      await exited
    }
    await rm(home, { recursive: true, force: true })
  }
})

test('Windows Job reclaims the Host even when the launcher is force killed', { skip: !windows, timeout: 100000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'OwnDsh crash test '))
  let instance
  try {
    instance = await start(home)
    const { pid } = JSON.parse(await readFile(join(home, 'desktop-runtime.json'), 'utf8'))
    const exited = once(instance.child, 'exit')
    instance.child.kill('SIGKILL')
    await exited
    for (let attempt = 0; attempt < 100; attempt++) {
      try { process.kill(pid, 0) } catch (error) {
        if (error.code === 'ESRCH') break
        throw error
      }
      await delay(50)
    }
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
    await assert.rejects(fetch(instance.url, { signal: AbortSignal.timeout(2000) }))
  } finally {
    if (instance?.child.exitCode === null && instance?.child.signalCode === null) {
      const exited = once(instance.child, 'exit')
      instance.child.stdin.end()
      await exited
    }
    await rm(home, { recursive: true, force: true })
  }
})
