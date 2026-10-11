/**
 * [INPUT]: prepare-release.mjs 与模拟的三平台发行资产
 * [OUTPUT]: 双架构 feed、真实文件校验值与缺失资产阻断的回归证据
 * [POS]: build/ 的发布验收；防止同名 feed 覆盖和不完整版本进入 Release
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { prepareRelease } from './prepare-release.mjs'

const VERSION = '0.2.0-rc.2.20261011.7'
const TAG = `v${VERSION}`
const MAC_ZIPS = ['arm64', 'x64'].map(arch => `owndsh-desktop-${VERSION}-mac-${arch}-unsigned.zip`)

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'owndsh-release-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const input = join(root, 'artifacts')
  const output = join(root, 'release')
  for (const target of ['win-x64', 'mac-arm64', 'mac-x64']) {
    const directory = join(input, `owndsh-desktop-${target}`)
    await mkdir(directory, { recursive: true })
    const extensions = target === 'win-x64' ? ['exe', 'exe.blockmap'] : ['dmg', 'zip', 'zip.blockmap']
    for (const extension of extensions) {
      const name = `owndsh-desktop-${VERSION}-${target}-unsigned.${extension}`
      await writeFile(join(directory, name), `fixture: ${name}`)
    }
    // 各架构同名 feed 不得进入发布目录覆盖合并结果。
    await writeFile(join(directory, target === 'win-x64' ? 'nightly.yml' : 'nightly-mac.yml'), target)
    await writeFile(join(directory, 'builder-debug.yml'), 'debug')
  }
  return { input, output }
}

test('release feed keeps both macOS architectures and hashes the shipped ZIPs', async t => {
  const { input, output } = await fixture(t)
  await prepareRelease(input, output, TAG)
  const feed = JSON.parse(await readFile(join(output, 'nightly-mac.yml'), 'utf8'))
  assert.equal(feed.version, VERSION)
  assert.deepEqual(feed.files.map(file => file.url), MAC_ZIPS)
  for (const file of feed.files) {
    const bytes = await readFile(join(output, file.url))
    assert.equal(file.size, bytes.length)
    assert.equal(file.sha512, createHash('sha512').update(bytes).digest('base64'))
    assert.ok((await readFile(join(output, `${file.url}.blockmap`))).length > 0)
  }
  assert.equal(feed.path, MAC_ZIPS[1])
  assert.equal(feed.sha512, feed.files[1].sha512)
  assert.equal(await readFile(join(output, 'nightly.yml'), 'utf8'), 'win-x64')
  assert.equal((await readdir(output)).length, 10)
  assert.ok(!(await readdir(output)).includes('builder-debug.yml'))
})

for (const missing of ['zip', 'zip.blockmap']) {
  test(`missing ARM ${missing} prevents release`, async t => {
    const { input, output } = await fixture(t)
    await rm(join(input, 'owndsh-desktop-mac-arm64', `owndsh-desktop-${VERSION}-mac-arm64-unsigned.${missing}`))
    await assert.rejects(prepareRelease(input, output, TAG), { code: 'ENOENT' })
    await assert.rejects(readdir(output), { code: 'ENOENT' })
  })
}

test('a mismatched release version prevents publication', async t => {
  const { input, output } = await fixture(t)
  await assert.rejects(prepareRelease(input, output, 'v0.2.0-rc.2.20261011.8'), { code: 'ENOENT' })
})
