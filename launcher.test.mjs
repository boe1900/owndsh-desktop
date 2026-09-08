/**
 * [INPUT]: 依赖真实随包运行环境、可选 OWNDSH_TEST_APP 原生入口与临时用户目录
 * [OUTPUT]: 验证离线播种/升级、WebSocket、配置持久化、卸载保留，以及原生壳启动与进程回收
 * [POS]: desktop 的最小真实进程回归，可同样指向安装包中的 runtime
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
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
const isRunning = pid => {
  try { process.kill(pid, 0); return true } catch (error) {
    if (error.code === 'ESRCH') return false
    throw error
  }
}

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
        ? execFileSync(environment.ComSpec, ['/d', '/s', '/c', `""${wrapper}" --version"`], { env: environment, encoding: 'utf8', windowsVerbatimArguments: true })
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
    const manifestPath = join(home, 'profiles/web/package.json')
    const prior = JSON.parse(await readFile(manifestPath, 'utf8'))
    prior.dependencies['owndsh-plugin'] = '0.0.0'
    prior.packageManager = 'pnpm@0.0.0'
    await writeFile(manifestPath, JSON.stringify(prior))
    instance = await start(home)
    const upgraded = JSON.parse(await readFile(manifestPath, 'utf8'))
    const bundledPlugin = JSON.parse(await readFile(join(runtime, 'node_modules/owndsh-plugin/package.json'), 'utf8'))
    assert.equal(upgraded.dependencies['owndsh-plugin'], bundledPlugin.version)
    assert.equal(upgraded.packageManager, `pnpm@${versions.pnpm}`)
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
    // 进程回收仅验证官方 Host，避免企业插件加载故障遮住平台生命周期问题。
    const bundles = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']
    await mkdir(join(home, 'profiles/web'), { recursive: true })
    await writeFile(join(home, 'profiles/web/package.json'), JSON.stringify({
      private: true, type: 'module', dependencies: Object.fromEntries(bundles.map(name => [name, versions['@deepseek-ai/dsh']])),
      dsh: { profile: { bundles } },
    }))
    instance = await start(home)
    const { pid } = JSON.parse(await readFile(join(home, 'desktop-runtime.json'), 'utf8'))
    const exited = once(instance.child, 'exit')
    instance.child.kill('SIGKILL')
    await exited
    for (let attempt = 0; attempt < 100 && isRunning(pid); attempt++) await delay(50)
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

test('native application starts its bundled service and leaves no Host after termination', {
  skip: !process.env.OWNDSH_TEST_APP, timeout: 150000,
}, async () => {
  const home = await mkdtemp(join(tmpdir(), 'OwnDsh native app test '))
  const app = spawn(process.env.OWNDSH_TEST_APP, [], {
    env: { ...environment, OWNDSH_DESKTOP_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  let launchError
  let state
  app.once('error', error => { launchError = error })
  for (const stream of [app.stdout, app.stderr]) stream.on('data', chunk => { output += chunk })
  try {
    for (let attempt = 0; attempt < 180; attempt++) {
      if (launchError) throw launchError
      assert.equal(app.exitCode, null, 'Native application exited during startup')
      state = await readFile(join(home, 'desktop-runtime.json'), 'utf8').then(JSON.parse).catch(error => {
        if (error.code === 'ENOENT') return undefined
        throw error
      })
      if (state) break
      await delay(500)
    }
    assert.ok(state, 'Native application must start the bundled launcher')
    assert.match(state.url, /^http:\/\/127\.0\.0\.1:\d+$/)
    assert.equal((await fetch(state.url, { signal: AbortSignal.timeout(5000) })).status, 401)
    const status = await (await fetch(`${state.url}${apiPrefix}/status`, { signal: AbortSignal.timeout(5000) })).json()
    assert.equal(status.data.state, 'UNCONFIGURED')
    // Host 就绪早于窗口 setup，等待原生初始化完成以捕获资源/图形运行时错误。
    await delay(2000)
    assert.equal(app.exitCode, null, 'Native application must remain alive after window setup')
  } catch (error) {
    const log = await readFile(join(home, 'desktop.log'), 'utf8').catch(() => '')
    error.message += `\nNative output:\n${output}\nHarness log:\n${log.slice(-16000)}`
    throw error
  } finally {
    if (app.pid && app.exitCode === null && app.signalCode === null) {
      const exited = once(app, 'exit')
      app.kill('SIGKILL')
      await exited
    }
    if (state) {
      const pids = [state.pid, state.launcherPid]
      for (let attempt = 0; attempt < 200 && pids.some(isRunning); attempt++) await delay(100)
      assert.ok(pids.every(pid => !isRunning(pid)), 'Application termination must reclaim launcher and Host')
      await assert.rejects(fetch(state.url, { signal: AbortSignal.timeout(2000) }))
    }
    await rm(home, { recursive: true, force: true })
  }
})
