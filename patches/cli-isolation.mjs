/**
 * [INPUT]: 官方 Desktop 命令安装器、PATH 管理器与 CLI 启动器
 * [OUTPUT]: OwnDsh Desktop 注册独立的 `owndsh` 命令及命令所有权元数据
 * [POS]: patches/ 的 CLI 隔离接缝；底层 CLI 仍复用官方实现，避免与官方 Desktop 争抢 `dsh`
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { rename } from 'node:fs/promises'
import { join } from 'node:path'
import { applyPatch } from './apply.mjs'

/**
 * 把官方命令入口改名，避免两个 Desktop 安装覆盖同一个全局命令。
 * @param source - 临时官方 checkout 根目录
 */
export async function cliIsolation(source) {
  for (const [from, to] of [
    ['apps/desktop/cli/dsh', 'apps/desktop/cli/owndsh'],
    ['apps/desktop/cli/dsh.cmd', 'apps/desktop/cli/owndsh.cmd'],
  ]) await rename(join(source, from), join(source, to))

  await applyPatch(source, {
    marker: 'OWNDSH-CLI-ISOLATION',
    file: 'apps/desktop/cli/owndsh',
    replacements: [[
      'set -e\n',
      "set -e\ncase \"${DSH_HOME-}\" in '') DSH_HOME=\"$HOME/.owndsh\"; export DSH_HOME ;; *[![:space:]]*) ;; *) DSH_HOME=\"$HOME/.owndsh\"; export DSH_HOME ;; esac\n",
    ]],
    output: 'macOS CLI 在 DSH_HOME 未设置或为空白时使用 ~/.owndsh',
  })

  await applyPatch(source, {
    marker: 'OWNDSH-CLI-ISOLATION',
    file: 'apps/desktop/cli/owndsh.cmd',
    replacements: [[
      'set "ELECTRON_RUN_AS_NODE=1"',
      '@if not defined DSH_HOME set "DSH_HOME=%USERPROFILE%\\.owndsh"\n@set "ELECTRON_RUN_AS_NODE=1"',
    ]],
    output: 'Windows CLI 默认使用 %USERPROFILE%\\.owndsh',
  })

  await applyPatch(source, {
    marker: 'OWNDSH-CLI-ISOLATION',
    file: 'apps/desktop/scripts/prepare-cli.ts',
    replacements: [[
      "  const name = platform === 'win32' ? 'dsh.cmd' : 'dsh'",
      "  const name = platform === 'win32' ? 'owndsh.cmd' : 'owndsh'",
    ]],
    output: '运行时准备独立的 owndsh CLI 启动器',
  })

  await applyPatch(source, {
    marker: 'OWNDSH-CLI-ISOLATION',
    file: 'apps/desktop/src/command-manager-entry.ts',
    replacements: [[
      "    const options = { destination: '/usr/local/bin/dsh', launcher: join(resources, 'runtime', 'cli', 'bin', 'dsh'),",
      "    const options = { destination: '/usr/local/bin/owndsh', launcher: join(resources, 'runtime', 'cli', 'bin', 'owndsh'),",
    ]],
    output: 'macOS 命令管理注册 owndsh',
  })

  await applyPatch(source, {
    marker: 'OWNDSH-CLI-ISOLATION',
    file: 'apps/desktop/src/command-management.ts',
    replacements: [
      ["? join(value.directory, 'dsh.cmd') : value.destination", "? join(value.directory, 'owndsh.cmd') : value.destination"],
      ['command -v dsh', 'command -v owndsh'],
    ],
    output: '命令管理 UI 检查 owndsh 的 PATH 选择',
  })

  await applyPatch(source, {
    marker: 'OWNDSH-CLI-ISOLATION',
    file: 'apps/desktop/src/command-installation.ts',
    replacements: [[
      "  return join(dirname(options.destination), '.dsh-desktop-command.json')",
      "  return join(dirname(options.destination), '.owndsh-desktop-command.json')",
    ]],
    output: 'macOS 命令收据与官方 Desktop 分离',
  })

  await applyPatch(source, {
    marker: 'OWNDSH-CLI-ISOLATION',
    file: 'apps/desktop/scripts/command-path.ps1',
    replacements: [
      ["'dsh.cmd'", "'owndsh.cmd'", 2],
      ["('dsh' + $extension)", "('owndsh' + $extension)"],
      ["'Software\\DeepSeekHarness\\Command'", "'Software\\OwnDsh\\Command'"],
      ["'Global\\DeepSeekHarness.Command.'", "'Global\\OwnDsh.Command.'"],
    ],
    output: 'Windows PATH、注册表和互斥键与官方 Desktop 分离',
  })

  await applyPatch(source, {
    marker: 'OWNDSH-CLI-ISOLATION',
    file: 'apps/desktop/src/locale.ts',
    replacements: [
      ['Manage dsh Command…', 'Manage owndsh Command…'],
      ['Manage dsh Command', 'Manage owndsh Command', 2],
      ['Current dsh command: {path}', 'Current owndsh command: {path}'],
      ['Another dsh takes precedence.', 'Another owndsh takes precedence.'],
      ['another dsh installation may take precedence.', 'another owndsh installation may take precedence.'],
      ['managing the dsh command.', 'managing the owndsh command.'],
      ['run dsh --version.', 'run owndsh --version.'],
      ['管理 dsh 命令…', '管理 owndsh 命令…'],
      ['管理 dsh 命令', '管理 owndsh 命令', 3],
      ['当前 dsh 命令：{path}', '当前 owndsh 命令：{path}'],
      ['另一个 dsh 的优先级更高。', '另一个 owndsh 的优先级更高。'],
      ['另一个 dsh 安装可能具有更高优先级。', '另一个 owndsh 安装可能具有更高优先级。'],
      ['运行 dsh --version。', '运行 owndsh --version。'],
    ],
    output: '菜单、提示和命令帮助文本使用 owndsh',
  })
}
