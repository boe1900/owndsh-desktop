/**
 * [INPUT]: 三个平台分别下载的 Actions Artifacts 与 v* 发行标签
 * [OUTPUT]: 完整 Release 资产及绑定发行标签的 Windows、双架构 macOS 更新清单
 * [POS]: build/ 的发布收口；从真实安装包生成清单，隔离 latest 变更与下载目标
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** 校验完整平台产物后汇总发布资产，缺失任一架构或 blockmap 时停止发布。 */
export async function prepareRelease(input, output, tag) {
  assert.match(tag, /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u, 'invalid release tag')
  const version = tag.slice(1)
  const download = `https://github.com/boe1900/owndsh-desktop/releases/download/${tag}/`
  const assets = []
  const filesByTarget = new Map()

  for (const target of ['win-x64', 'mac-arm64', 'mac-x64']) {
    const directory = join(input, `owndsh-desktop-${target}`)
    const prefix = `owndsh-desktop-${version}-${target}-unsigned`
    const extensions = target === 'win-x64' ? ['exe', 'exe.blockmap'] : ['dmg', 'zip', 'zip.blockmap']
    const names = extensions.map(extension => `${prefix}.${extension}`)
    for (const name of names) {
      const path = join(directory, name)
      const info = await stat(path)
      assert.ok(info.isFile() && info.size > 0, `missing or empty release asset: ${path}`)
      assets.push({ path, name })
      if (name.endsWith('.exe') || name.endsWith('.zip')) {
        const hash = createHash('sha512')
        for await (const chunk of createReadStream(path)) hash.update(chunk)
        filesByTarget.set(target, { url: `${download}${name}`, sha512: hash.digest('base64'), size: info.size })
      }
    }
  }

  await mkdir(output, { recursive: true })
  assert.equal((await readdir(output)).length, 0, 'release output must be empty')
  for (const { path, name } of assets) await copyFile(path, join(output, name))

  // JSON 是有效的 YAML；无需新增解析依赖，electron-updater 按 files 选择架构。
  const releaseDate = new Date().toISOString()
  for (const [name, targets] of [
    ['nightly.yml', ['win-x64']],
    ['nightly-mac.yml', ['mac-arm64', 'mac-x64']],
  ]) {
    const files = targets.map(target => filesByTarget.get(target))
    const fallback = files.at(-1)
    const feed = { version, files, path: fallback.url, sha512: fallback.sha512, releaseDate }
    await writeFile(join(output, name), `${JSON.stringify(feed, null, 2)}\n`)
  }
}

if (import.meta.main) {
  assert.equal(process.argv.length, 5, 'usage: node build/prepare-release.mjs <artifacts> <output> <tag>')
  await prepareRelease(...process.argv.slice(2))
}
