/**
 * [INPUT]: 精确 commit 的官方 Desktop 源码、npm 插件版本
 * [OUTPUT]: 在构建副本禁用两套更新、隔离 OwnDsh 数据并首次播种插件
 * [POS]: 发行适配边界；保留官方 Electron 窗口、preload、认证与 Host 生命周期
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function patchDesktop(source, pluginVersion) {
  async function patch(file, replacements) {
    const path = join(source, file)
    let content = await readFile(path, 'utf8')
    for (const [before, after] of replacements) {
      assert.equal(content.split(before).length, 2, `Official Desktop seam changed: ${file}: ${before}`)
      content = content.replace(before, after)
    }
    await writeFile(path, `/**
 * [INPUT]: 官方 ${file} 的原始依赖与 OwnDsh 发行配置
 * [OUTPUT]: 保留官方接口，应用下方 OWNDSH 标记的发行差异
 * [POS]: 临时构建副本；修改真源为仓库 patch-desktop.mjs
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */\n${content}`)
  }
  await patch('apps/desktop/src/main.ts', [
    ["import { claimDesktopSingleInstance }", "import { recoverCredentialLock } from './credential-lock.mjs'\nimport { claimDesktopSingleInstance }"],
    ['async function main(): Promise<void> {', 'async function main(): Promise<void> {\n  // OWNDSH: 此处已持有单实例锁，回收上次异常退出遗留的凭据锁。\n  await recoverCredentialLock(process.env.DSH_HOME!)'],
    ["const ownsDesktopInstance = claimDesktopSingleInstance", `// OWNDSH: 实验版隔离数据，必须在单实例锁及 profile 访问之前设置。
app.setPath('userData', process.env.OWNDSH_DESKTOP_HOME ? join(process.env.OWNDSH_DESKTOP_HOME, 'electron') : join(app.getPath('appData'), 'com.owndsh.desktop.electron'))
process.env.DSH_HOME = process.env.OWNDSH_DESKTOP_HOME ?? join(app.getPath('userData'), 'Harness')
const ownsDesktopInstance = claimDesktopSingleInstance`],
    ["join(app.getAppPath(), 'dsh')", 'app.getAppPath()'],
    ["applicationName: 'DeepSeek Harness'", "applicationName: 'OwnDsh'"],
    ["    { label: currentDesktopLocale().messages.checkUpdatesMenu, click: () => { void openUpdatePrompt(true) } },\n    { type: 'separator' },", '    // OWNDSH: 暂不提供更新菜单，恢复更新服务时再启用。'],
    ['  const automaticCheck = (): void => {', '  const automaticCheck = (): void => {\n    // OWNDSH: 暂停启动、前台和系统唤醒时的所有更新查询。\n    return'],
    ['  const openUpdatePrompt = (manual = false): Promise<void> => {', '  const openUpdatePrompt = (manual = false): Promise<void> => {\n    // OWNDSH: 暂停手动更新入口和对应 IPC。\n    return Promise.resolve()'],
    ['  const policyConfig = resolveDesktopPolicyConfig(policyInput, !app.isPackaged)', '  // OWNDSH: 不读取环境或清单中的强更策略，禁止创建查询及阻塞窗口。\n  const policyConfig = resolveDesktopPolicyConfig(undefined, !app.isPackaged)'],
  ])
  // 关闭协调器本身，确保 IPC 或今后新增调用也不能检查、下载或安装。
  await patch('apps/desktop/src/update-coordinator.ts', [
    ['  async check(manual = false): Promise<DesktopUpdateState> {', '  async check(manual = false): Promise<DesktopUpdateState> {\n    // OWNDSH: 更新服务暂未启用。\n    return this.current'],
    ['  async download(version: string): Promise<DesktopUpdateState> {', '  async download(version: string): Promise<DesktopUpdateState> {\n    // OWNDSH: 更新服务暂未启用。\n    return this.current'],
    ['  async install(version: string): Promise<DesktopUpdateState> {', '  async install(version: string): Promise<DesktopUpdateState> {\n    // OWNDSH: 更新服务暂未启用。\n    return this.current'],
  ])
  await patch('apps/desktop/src/preload-app.ts', [
    ["location.protocol === `${SCHEME}:` && location.hostname === 'app' ? product : { protocolVersion: 1 }", '{ protocolVersion: 1 } /* OWNDSH: 不向页面暴露更新操作。 */'],
  ])
  await patch('apps/desktop/src/project-manager.ts', [
    ['  initProfile(projectDir, WEB_PROFILE.bundles)', `  const fresh = !existsSync(join(projectDir, 'package.json'))
  initProfile(projectDir, fresh ? [...WEB_PROFILE.bundles, 'owndsh-plugin'] : WEB_PROFILE.bundles)
  // OWNDSH: 只初始化全新 profile；用户卸载、禁用或替换的插件不复活。
  if (fresh) {
    const path = join(projectDir, 'package.json')
    const manifest = JSON.parse(readFileSync(path, 'utf8'))
    manifest.dependencies['owndsh-plugin'] = ${JSON.stringify(pluginVersion)}
    writeJson(path, manifest)
  }`],
  ])
  // 防止多套实验程序占用官方固定端口，由系统选择可用回环端口。
  await patch('apps/desktop-host/src/index.ts', [
    ["join(runtimeDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')", "join(runtimeDir, 'package.json') /* OWNDSH: 发行依赖闭包也包含预装的第三方 bundle。 */"],
    ["args: ['--no-open', '--port', '19387']", "args: ['--no-open', '--port', '0']"],
    ['    patchFiles: [],', "    // OWNDSH: 仅在插件启用时接入官方包管理桥接，卸载后的启动不再覆盖该 row。\n    patchFiles: profile.layers.some(layer => layer.packageName === 'owndsh-plugin') ? [join(runtimeDir, 'owndsh-desktop.patch.yml')] : [],"],
  ])
}
