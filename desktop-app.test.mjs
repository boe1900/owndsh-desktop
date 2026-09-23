/**
 * [INPUT]: 实际打包 Electron 可执行文件、临时独立用户目录与 Playwright Electron 驱动
 * [OUTPUT]: 验证运行树、原生模块/文档转换、独立数据目录、插件预装与卸载，失败时输出官方启动诊断
 * [POS]: 安装包实际窗口与 Host 的端到端验收；CI macOS/Windows 用直接进程启动规避 runner 的 Electron CDP 限制
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { _electron as electron } from 'playwright'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const executablePath = process.env.OWNDSH_TEST_APP
assert.ok(executablePath, 'Set OWNDSH_TEST_APP to the actual packaged Electron executable')

async function bootPackagedAppWithoutCdp() {
  const home = await mkdtemp(join(tmpdir(), 'OwnDsh Electron boot '))
  const diagnosticFile = join(home, 'startup-error.log')
  const child = spawn(executablePath, ['--enable-logging=stderr', '--disable-gpu', '--no-sandbox'], {
    env: { ...process.env, OWNDSH_DESKTOP_HOME: home, DSH_TELEMETRY_DISABLED: '1', DSH_DESKTOP_DIAGNOSTIC_FILE: diagnosticFile },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', chunk => { stderr += chunk })
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
  const stillRunning = await Promise.race([exited, new Promise(resolve => setTimeout(() => resolve(undefined), 15000))])
  try {
    assert.equal(stillRunning, undefined, `packaged macOS app exited during boot: ${JSON.stringify(stillRunning)}`)
    assert.equal(await readFile(diagnosticFile, 'utf8').catch(() => ''), '')
    assert.doesNotMatch(stderr, /Can't find variable: Iterator|failed to import loader entry|ENT_PLUGIN_CLI_FAILED/u)
  } finally {
    child.kill('SIGTERM')
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))])
    child.kill('SIGKILL')
    await rm(home, { recursive: true, force: true })
  }
}

test('packaged official desktop boots beta.10 with an isolated profile and preinstalled plugin', { timeout: 300000 }, async () => {
  // OWNDSH-PACKAGING: GitHub macOS/Windows runners expose Node Inspector but not Electron CDP to Playwright.
  if (process.env.CI === 'true' && process.platform !== 'linux') return bootPackagedAppWithoutCdp()
  const home = await mkdtemp(join(tmpdir(), 'OwnDsh Electron acceptance '))
  const diagnosticFile = join(home, 'startup-error.log')
  let app
  let stderr = ''
  const stop = async () => {
    if (!app) return
    const deadline = setTimeout(() => app.process().kill('SIGKILL'), 10000)
    try { await app.close() } finally { clearTimeout(deadline); app = undefined }
  }
  const start = async () => {
    app = await electron.launch({ executablePath, timeout: 90000, args: [
      '--enable-logging=stderr', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9222',
    ], env: {
      ...process.env, OWNDSH_DESKTOP_HOME: home, DSH_TELEMETRY_DISABLED: '1',
      DSH_DESKTOP_DIAGNOSTIC_FILE: diagnosticFile,
    } })
    app.process().stderr.on('data', chunk => { stderr += chunk })
    const page = await app.firstWindow()
    page.setDefaultTimeout(60000)
    return page
  }
  try {
    let page = await start()
    await page.waitForFunction(() => document.body.innerText.length > 20)
    const appPath = await app.evaluate(({ app }) => app.getAppPath())
    const { verifyDesktopRuntime, inventoryDesktopRuntime } = await import('./.build/official-build/apps/desktop/lib/types/runtime-tree.js')
    try { await verifyDesktopRuntime(join(appPath, 'dsh'), '0.1.7-alpha.1') } catch (error) {
      const expected = JSON.parse(await readFile(join(appPath, 'dsh/desktop-runtime.json'), 'utf8')).files
      const actual = inventoryDesktopRuntime(join(appPath, 'dsh'))
      const before = new Map(expected.map(file => [file.path, file]))
      const after = new Map(actual.map(file => [file.path, file]))
      const changed = [...new Set([...before.keys(), ...after.keys()])].filter(path => {
        const a = before.get(path), b = after.get(path)
        return !a || !b || a.bytes !== b.bytes || a.sha256 !== b.sha256
      })
      process.stderr.write(JSON.stringify({ expectedFiles: expected.length, actualFiles: actual.length,
        changed: changed.slice(0, 30).map(path => ({ path, before: before.get(path), after: after.get(path) })) }, null, 2) + '\n')
      throw error
    }
    const native = await promisify(execFile)(executablePath, ['--expose-internals',
      join(import.meta.dirname, '.build/official-harness/apps/desktop/tests/fixtures/runtime-payload-smoke.mjs'), join(appPath, 'dsh'),
    ], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 120000 })
    assert.match(native.stdout, /"pty":true/)
    await cp(join(import.meta.dirname, '.build/official-harness/packages/bundle/web-app/tests/fixtures/document-conversion.docx'), join(home, 'preview.docx'))
    await promisify(execFile)(executablePath, ['--input-type=module', '-e', `
      import { createRequire } from 'node:module'
      import { pathToFileURL } from 'node:url'
      const requireRuntime = createRequire(process.argv[1] + '/package.json')
      const { createConverter } = await import(pathToFileURL(requireRuntime.resolve('@deepseek-ai/libreoffice-kit')))
      const converter = await createConverter()
      try { await converter.render({ inputPath: process.argv[2], outputPath: process.argv[3] }) }
      finally { await converter.dispose() }
    `, join(appPath, 'dsh'), join(home, 'preview.docx'), join(home, 'preview.pdf')], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 150000,
    })
    assert.equal((await readFile(join(home, 'preview.pdf'))).subarray(0, 5).toString(), '%PDF-')
    assert.equal(await page.evaluate(() => typeof Iterator), 'function')
    assert.equal(await page.evaluate(() => typeof window.dshDesktop.updates.status), 'function')
    const profilePath = join(home, 'Harness/profiles/desktop/package.json')
    let profile = JSON.parse(await readFile(profilePath, 'utf8'))
    assert.equal(profile.dependencies['owndsh-plugin'], '0.1.0-beta.10')
    await page.waitForFunction(async () => {
      const response = await fetch('/enterprise/api/v1/local/status')
      return response.status === 200
    })
    const response = await page.evaluate(async () => {
      const r = await fetch('/enterprise/api/v1/local/server', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serverUrl: 'http://127.0.0.1:18888' }),
      })
      return { status: r.status, body: await r.text() }
    })
    assert.equal(response.status, 200, response.body)
    await stop()
    page = await start()
    await page.waitForFunction(() => document.body.innerText.length > 20)
    assert.match(await readFile(join(home, 'Harness/settings.yaml'), 'utf8'), /18888/)
    const removed = await page.evaluate(async () => {
      const r = await fetch('/enterprise/api/v1/local/uninstall', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      return { status: r.status, body: await r.text() }
    })
    assert.equal(removed.status, 200, removed.body)
    profile = JSON.parse(await readFile(profilePath, 'utf8'))
    assert.equal(profile.dependencies?.['owndsh-plugin'], undefined)
    assert.ok(!profile.dsh.profile.bundles.includes('owndsh-plugin'))
    await stop()
    page = await start()
    await page.waitForFunction(() => document.body.innerText.length > 100 && !document.body.innerText.includes('正在连接'))
    assert.equal(app.windows().some(window => window.url().includes('/welcome.html')), false)
    assert.ok(!JSON.parse(await readFile(profilePath, 'utf8')).dsh.profile.bundles.includes('owndsh-plugin'))
    assert.doesNotMatch(stderr, /Can't find variable: Iterator|failed to import loader entry|ENT_PLUGIN_CLI_FAILED/)
  } catch (error) {
    process.stderr.write(stderr.slice(-10000))
    process.stderr.write(await readFile(diagnosticFile, 'utf8').catch(() => 'No startup diagnostic file was written.\n'))
    for (const page of app?.windows() ?? []) {
      process.stderr.write(`\n${page.url()}\n${await page.locator('body').innerText({ timeout: 2000 }).catch(() => '')}\n`)
    }
    throw error
  } finally {
    await stop()
    await rm(home, { recursive: true, force: true })
  }
})
