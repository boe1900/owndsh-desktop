/**
 * [INPUT]: 实际打包 Electron 可执行文件、临时独立用户目录与 Playwright Electron 驱动
 * [OUTPUT]: 验证 beta.8 门禁、原生终端、更新禁用、配置持久化、未登录卸载和重启不复活
 * [POS]: 安装包实际窗口与 Host 的端到端验收，运行时不接触用户真实数据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { _electron as electron } from 'playwright'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const executablePath = process.env.OWNDSH_TEST_APP
assert.ok(executablePath, 'Set OWNDSH_TEST_APP to the actual packaged Electron executable')

test('packaged official desktop boots beta.8, keeps data and uninstalls without login', { timeout: 300000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'OwnDsh Electron acceptance '))
  let app
  let stderr = ''
  const stop = async () => {
    if (!app) return
    const deadline = setTimeout(() => app.process().kill('SIGKILL'), 10000)
    try { await app.close() } finally { clearTimeout(deadline); app = undefined }
  }
  const start = async () => {
    app = await electron.launch({ executablePath, timeout: 60000, env: {
      ...process.env, OWNDSH_DESKTOP_HOME: home, DSH_TELEMETRY_DISABLED: '1',
      DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: '{"origin":"https://invalid.example"}',
    } })
    app.process().stderr.on('data', chunk => { stderr += chunk })
    const page = await app.firstWindow()
    page.setDefaultTimeout(60000)
    return page
  }
  try {
    let page = await start()
    await page.getByRole('dialog', { name: 'OwnDsh', exact: true }).waitFor()
    const appPath = await app.evaluate(({ app }) => app.getAppPath())
    const native = await promisify(execFile)(executablePath, ['--expose-internals',
      join(import.meta.dirname, '.build/official-harness/apps/desktop/tests/fixtures/runtime-payload-smoke.mjs'), appPath,
    ], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 120000 })
    assert.match(native.stdout, /"pty":true/)
    await cp(join(import.meta.dirname, '.build/official-harness/packages/bundle/web-app/tests/fixtures/document-conversion.docx'), join(home, 'preview.docx'))
    await promisify(execFile)(executablePath, ['--input-type=module', '-e', `
      import { createRequire } from 'node:module'
      import { pathToFileURL } from 'node:url'
      const requireRuntime = createRequire(process.argv[1] + '/package.json')
      const { createConverter } = await import(pathToFileURL(requireRuntime.resolve('@deepseek-ai/libreoffice-kit')))
      const converter = await createConverter({ timeoutMs: 60000 })
      try { await converter.render({ inputPath: process.argv[2], outputPath: process.argv[3] }) }
      finally { await converter.dispose() }
    `, appPath, join(home, 'preview.docx'), join(home, 'preview.pdf')], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 90000,
    })
    assert.equal((await readFile(join(home, 'preview.pdf'))).subarray(0, 5).toString(), '%PDF-')
    assert.equal(await page.evaluate(() => typeof Iterator), 'function')
    assert.equal(await page.evaluate(() => window.dshDesktop.updates), undefined)
    const profilePath = join(home, 'profiles/desktop/package.json')
    let profile = JSON.parse(await readFile(profilePath, 'utf8'))
    assert.equal(profile.dependencies['owndsh-plugin'], '0.1.0-beta.8')
    const response = await page.evaluate(async () => {
      const r = await fetch('/enterprise/api/v1/local/server', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serverUrl: 'http://127.0.0.1:18888' }),
      })
      return { status: r.status, body: await r.text() }
    })
    assert.equal(response.status, 200, response.body)
    await stop()
    page = await start()
    await page.getByRole('dialog', { name: 'OwnDsh', exact: true }).waitFor()
    assert.match(await readFile(join(home, 'settings.yaml'), 'utf8'), /18888/)
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
    assert.equal(await page.getByRole('dialog', { name: 'OwnDsh', exact: true }).count(), 0)
    assert.ok(!JSON.parse(await readFile(profilePath, 'utf8')).dsh.profile.bundles.includes('owndsh-plugin'))
    assert.doesNotMatch(stderr, /Can't find variable: Iterator|failed to import loader entry|ENT_PLUGIN_CLI_FAILED/)
  } catch (error) {
    process.stderr.write(stderr.slice(-10000))
    for (const page of app?.windows() ?? []) {
      process.stderr.write(`\n${page.url()}\n${await page.locator('body').innerText({ timeout: 2000 }).catch(() => '')}\n`)
    }
    throw error
  } finally {
    await stop()
    await rm(home, { recursive: true, force: true })
  }
})
