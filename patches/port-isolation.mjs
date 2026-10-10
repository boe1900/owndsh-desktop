/**
 * [INPUT]: 官方 desktop-host 启动参数与 dsh-host-webserver 的动态端口能力
 * [OUTPUT]: OwnDsh Desktop 的 Host 使用操作系统分配的空闲回环端口
 * [POS]: patches/ 的并行安装隔离接缝；避免与官方 Desktop 同时运行时抢占 19387
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { applyPatch } from './apply.mjs'

/**
 * 让官方 WebServer 选择空闲端口；Host 会把实际端口放进 authenticated URL。
 * @param source - 临时官方 checkout 根目录
 */
export async function portIsolation(source) {
  await applyPatch(source, {
    marker: 'OWNDSH-PORT-ISOLATION',
    file: 'apps/desktop-host/src/index.ts',
    replacements: [[
      "    args: ['--no-open', '--port', '19387'],",
      "    // OWNDSH-PORT-ISOLATION: 官方与 OwnDsh 可并行运行，端口由操作系统分配。\n    args: ['--no-open', '--port', '0'],",
    ]],
    output: 'OwnDsh Host 使用操作系统分配的空闲 WebServer 端口',
  })
}
