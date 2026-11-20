/**
 * [INPUT]: prepare-release.mjs 与模拟的三平台发行资产
 * [OUTPUT]: 两端固定版本下载地址、真实安装包校验值与缺失资产阻断的回归证据
 * [POS]: build/ 的发布验收；防止 latest 切换后混用版本及不完整资产进入 Release
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { test } from 'node:test'
import { prepareRelease } from './prepare-release.mjs'

const VERSION = '0.2.0-rc.2.20261011.7'
const TAG = `v${VERSION}`
const RELEASES = 'https://github.com/boe1900/owndsh-desktop/releases/'
const WINDOWS_EXE = `owndsh-desktop-${VERSION}-win-x64-unsigned.exe`
const MAC_ZIPS = ['arm64', 'x64'].map(arch => `owndsh-desktop-${VERSION}-mac-${arch}-unsigned.zip`)

async function fixture(t, version = VERSION) {
  const root = await mkdtemp(join(tmpdir(), 'owndsh-release-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const input = join(root, 'artifacts')
  const output = join(root, 'release')
  for (const target of ['win-x64', 'mac-arm64', 'mac-x64']) {
    const directory = join(input, `owndsh-desktop-${target}`)
    await mkdir(directory, { recursive: true })
    const extensions = target === 'win-x64' ? ['exe', 'exe.blockmap'] : ['dmg', 'zip', 'zip.blockmap']
    for (const extension of extensions) {
      const name = `owndsh-desktop-${version}-${target}-unsigned.${extension}`
      await writeFile(join(directory, name), `fixture: ${name}`)
    }
    const name = `owndsh-desktop-${version}-${target}-unsigned.${target === 'win-x64' ? 'exe' : 'zip'}`
    const feed = { version, files: [{ url: name, sha512: 'upstream-placeholder', size: 1 }], path: name }
    await writeFile(join(directory, target === 'win-x64' ? 'nightly.yml' : 'nightly-mac.yml'), JSON.stringify(feed))
    await writeFile(join(directory, 'builder-debug.yml'), 'debug')
  }
  return { input, output }
}

test('Windows feed pins the release URL and hashes the shipped EXE', async t => {
  const { input, output } = await fixture(t)
  await prepareRelease(input, output, TAG)
  const feed = JSON.parse(await readFile(join(output, 'nightly.yml'), 'utf8'))
  assert.equal(feed.version, VERSION)
  assert.deepEqual(feed.files.map(file => file.url), [`${RELEASES}download/${TAG}/${WINDOWS_EXE}`])
  const bytes = await readFile(join(output, WINDOWS_EXE))
  assert.equal(feed.files[0].size, bytes.length)
  assert.equal(feed.files[0].sha512, createHash('sha512').update(bytes).digest('base64'))
  assert.equal(feed.path, feed.files[0].url)
  assert.equal(feed.sha512, feed.files[0].sha512)
})

test('release feed keeps both macOS architectures and hashes the shipped ZIPs', async t => {
  const { input, output } = await fixture(t)
  await prepareRelease(input, output, TAG)
  const feed = JSON.parse(await readFile(join(output, 'nightly-mac.yml'), 'utf8'))
  assert.equal(feed.version, VERSION)
  assert.deepEqual(feed.files.map(file => file.url), MAC_ZIPS.map(name => `${RELEASES}download/${TAG}/${name}`))
  for (const file of feed.files) {
    const name = basename(new URL(file.url).pathname)
    const bytes = await readFile(join(output, name))
    assert.equal(file.size, bytes.length)
    assert.equal(file.sha512, createHash('sha512').update(bytes).digest('base64'))
    assert.ok((await readFile(join(output, `${name}.blockmap`))).length > 0)
  }
  assert.equal(feed.path, feed.files[1].url)
  assert.equal(feed.sha512, feed.files[1].sha512)
  assert.equal((await readdir(output)).length, 10)
  assert.ok(!(await readdir(output)).includes('builder-debug.yml'))
})

test('held update metadata still resolves its own assets after latest changes', async t => {
  const oldVersion = '0.2.2-rc.3'
  const currentVersion = '0.2.2-rc.5'
  const old = await fixture(t, oldVersion)
  const current = await fixture(t, currentVersion)
  await prepareRelease(old.input, old.output, `v${oldVersion}`)
  await prepareRelease(current.input, current.output, `v${currentVersion}`)
  for (const name of ['nightly.yml', 'nightly-mac.yml']) {
    const held = JSON.parse(await readFile(join(old.output, name), 'utf8'))
    const latest = JSON.parse(await readFile(join(current.output, name), 'utf8'))
    assert.equal(latest.version, currentVersion)
    for (const file of held.files) {
      const expected = `${RELEASES}download/v${oldVersion}/${basename(file.url)}`
      assert.equal(new URL(file.url, `${RELEASES}latest/download/`).href, expected)
      assert.equal(new URL(file.url, `${RELEASES}download/v${latest.version}/`).href, expected)
    }
  }
})

for (const [target, extension] of [
  ['win-x64', 'exe'],
  ['win-x64', 'exe.blockmap'],
  ['mac-arm64', 'zip'],
  ['mac-arm64', 'zip.blockmap'],
]) {
  test(`missing ${target} ${extension} prevents release`, async t => {
    const { input, output } = await fixture(t)
    await rm(join(input, `owndsh-desktop-${target}`, `owndsh-desktop-${VERSION}-${target}-unsigned.${extension}`))
    await assert.rejects(prepareRelease(input, output, TAG), { code: 'ENOENT' })
    await assert.rejects(readdir(output), { code: 'ENOENT' })
  })
}

test('a mismatched release version prevents publication', async t => {
  const { input, output } = await fixture(t)
  await assert.rejects(prepareRelease(input, output, 'v0.2.0-rc.2.20261011.8'), { code: 'ENOENT' })
})
