/**
 * [INPUT]: 官方 macOS 打包校验、Electron Builder 配置、目标打包器和冒烟脚本
 * [OUTPUT]: 不依赖 Apple 证书即可生成 OwnDsh macOS ARM64/x64 unsigned 产物
 * [POS]: patches/ 的开源发行接缝；只增加 unsigned 路径，保留官方签名发行路径
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { applyPatch } from './apply.mjs'

/**
 * 允许公开开源构建在没有 Apple Developer 凭据时生成 macOS unsigned 包。
 * @param source - 临时官方 checkout 根目录
 */
export async function macosUnsigned(source) {
  await applyPatch(source, {
    marker: 'OWNDSH-MAC-UNSIGNED',
    file: 'apps/desktop/scripts/desktop-package-environment.mjs',
    replacements: [
      [' * @param {{ unsigned?: boolean, prepareOnly?: boolean }} options Explicit packaging mode.',
        ' * @param {{ unsigned?: boolean, unsignedMac?: boolean, prepareOnly?: boolean }} options Explicit packaging mode.'],
      ['  if (options.unsigned) return', '  if (options.unsigned || options.unsignedMac) return'],
    ],
    output: 'macOS unsigned 构建跳过 Apple 签名与 notarization 凭据校验',
  })

  await applyPatch(source, {
    marker: 'OWNDSH-MAC-UNSIGNED',
    file: 'apps/desktop/scripts/prepare-dsh.ts',
    replacements: [
      ["    if (process.platform === 'darwin') {", "    if (process.platform === 'darwin' && process.env.DSH_DESKTOP_MAC_UNSIGNED !== '1') {"],
    ],
    output: 'macOS unsigned 运行时跳过 native 文件签名但保留运行时校验',
  })

  await applyPatch(source, {
    marker: 'OWNDSH-MAC-UNSIGNED',
    file: 'apps/desktop/scripts/electron-builder-config.mjs',
    replacements: [
      [`  if (env.DSH_DESKTOP_UNSIGNED !== undefined && !['0', '1'].includes(env.DSH_DESKTOP_UNSIGNED)) {
    throw new Error('desktop package: DSH_DESKTOP_UNSIGNED must be 0 or 1')
  }
  const unsigned = env.DSH_DESKTOP_UNSIGNED === '1'
  if (unsigned && resolvedPlatform !== 'win32') throw new Error('desktop package: unsigned builds require Windows')`,
        `  if (env.DSH_DESKTOP_UNSIGNED !== undefined && !['0', '1'].includes(env.DSH_DESKTOP_UNSIGNED)) {
    throw new Error('desktop package: DSH_DESKTOP_UNSIGNED must be 0 or 1')
  }
  if (env.DSH_DESKTOP_MAC_UNSIGNED !== undefined && !['0', '1'].includes(env.DSH_DESKTOP_MAC_UNSIGNED)) {
    throw new Error('desktop package: DSH_DESKTOP_MAC_UNSIGNED must be 0 or 1')
  }
  const unsignedWindows = env.DSH_DESKTOP_UNSIGNED === '1'
  const unsignedMacOS = env.DSH_DESKTOP_MAC_UNSIGNED === '1'
  if (unsignedWindows && unsignedMacOS) throw new Error('desktop package: Windows and macOS unsigned modes are mutually exclusive')
  if (unsignedWindows && resolvedPlatform !== 'win32') throw new Error('desktop package: Windows unsigned builds require Windows')
  if (unsignedMacOS && resolvedPlatform !== 'darwin') throw new Error('desktop package: macOS unsigned builds require macOS')
  const unsigned = unsignedWindows || unsignedMacOS`],
      [`  const macOSSigning = packagesMacOS ? resolveMacOSSigningEnvironment(env) : undefined
  if (packagesMacOS) resolveMacOSNotarizationEnvironment(env)`,
        `  const macOSSigning = packagesMacOS && !unsigned ? resolveMacOSSigningEnvironment(env) : undefined
  if (packagesMacOS && !unsigned) resolveMacOSNotarizationEnvironment(env)`],
      ['      forceCodeSigning: true,', '      forceCodeSigning: !unsigned,'],
      [`    dmg: {
      sign: true,`, `    dmg: {
      sign: !unsigned,`],
      [`      if (context.electronPlatformName !== 'darwin') return`,
        `      if (context.electronPlatformName !== 'darwin' || unsigned) return`],
      [`    artifactBuildCompleted: artifact => {
      if (!artifact.file.endsWith('.dmg')) return`,
        `    artifactBuildCompleted: artifact => {
      if (unsigned || !artifact.file.endsWith('.dmg')) return`],
    ],
    output: 'Electron Builder 允许 macOS unsigned 并跳过签名后校验与 notarization',
  })

  await applyPatch(source, {
    marker: 'OWNDSH-MAC-UNSIGNED',
    file: 'apps/desktop/scripts/package-target.ts',
    replacements: [
      [`  readonly unsigned: boolean
  readonly check: boolean`, `  readonly unsigned: boolean
  readonly unsignedMac: boolean
  readonly check: boolean`],
      [`      unsigned: { type: 'boolean', default: false },
      check: { type: 'boolean', default: false },`, `      unsigned: { type: 'boolean', default: false },
      'unsigned-mac': { type: 'boolean', default: false },
      check: { type: 'boolean', default: false },`],
      [`  if (values.unsigned && name !== 'win-x64') throw new Error('desktop package: --unsigned requires win-x64')
  if (values.unsigned && values['prepare-only']) throw new Error('desktop package: --unsigned cannot use --prepare-only')`, `  if (values.unsigned && values['unsigned-mac']) throw new Error('desktop package: --unsigned and --unsigned-mac are mutually exclusive')
  if (values['unsigned-mac'] && !name.startsWith('mac-')) throw new Error('desktop package: --unsigned-mac requires a macOS target')
  if (values.unsigned && name !== 'win-x64') throw new Error('desktop package: --unsigned requires win-x64')
  if (values.unsigned && values['prepare-only']) throw new Error('desktop package: --unsigned cannot use --prepare-only')`],
      [`    unsigned: values.unsigned,
    check: values.check,`, `    unsigned: values.unsigned,
    unsignedMac: values['unsigned-mac'],
    check: values.check,`],
      ['    artifactsRoot: invocation.unsigned ? paths.unsignedArtifacts : paths.artifacts,', '    artifactsRoot: invocation.unsigned || invocation.unsignedMac ? paths.unsignedArtifacts : paths.artifacts,'],
      ['    target: target.name, unsigned: invocation.unsigned, directory: invocation.directory, prepareOnly: invocation.prepareOnly,', '    target: target.name, unsigned: invocation.unsigned || invocation.unsignedMac, directory: invocation.directory, prepareOnly: invocation.prepareOnly,'],
      [`  const buildEnv = withoutWindowsSigningEnvironment(withoutDesktopUploadCredentials(environment))
  const targetEnv: NodeJS.ProcessEnv = {`, `  const buildEnv = withoutWindowsSigningEnvironment(withoutDesktopUploadCredentials(environment))
  if (invocation.unsignedMac) buildEnv.DSH_DESKTOP_MAC_UNSIGNED = '1'
  const targetEnv: NodeJS.ProcessEnv = {`],
      [`      await packagingStep(run.directory, 'macos-package', () => withMacOSSigningKeychain(environment,
        signingEnvironment => packageTarget(invocation, signingEnvironment, run)), secrets)`,
        `      await packagingStep(run.directory, 'macos-package', () => invocation.unsignedMac
        ? packageTarget(invocation, environment, run)
        : withMacOSSigningKeychain(environment,
          signingEnvironment => packageTarget(invocation, signingEnvironment, run)), secrets)`],
      [`  const electronBuilderEnv = desktopElectronBuilderEnvironment(downloadEnv, invocation.unsigned)
  for (const name of WINDOWS_SIGNING_ENV_NAMES) {`, `  const electronBuilderEnv = desktopElectronBuilderEnvironment(downloadEnv, invocation.unsigned || invocation.unsignedMac)
  if (invocation.unsignedMac) {
    electronBuilderEnv.DSH_DESKTOP_UNSIGNED = '0'
    electronBuilderEnv.DSH_DESKTOP_MAC_UNSIGNED = '1'
    electronBuilderEnv.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  }
  for (const name of WINDOWS_SIGNING_ENV_NAMES) {`],
      [`  if (target.platform === 'darwin' && !invocation.directory) {`, `  if (target.platform === 'darwin' && invocation.unsignedMac) {
    await execute([...desktopElectronBuilderArguments(target, true), '--config.mac.notarize=false'], electronBuilderEnv)
    await execute(['exec', 'tsx', 'scripts/smoke-packaged-runtime.ts', '--unsigned-mac'], targetEnv)
    await execute([...desktopElectronBuilderArguments(target, false), '--config.mac.notarize=false'], electronBuilderEnv)
  } else if (target.platform === 'darwin' && !invocation.directory) {`],
      ['  if (!invocation.directory && !invocation.unsigned) writeReleaseRecord(target, electronBuilderEnv, buildPaths.artifacts)', '  if (!invocation.directory && !invocation.unsigned && !invocation.unsignedMac) writeReleaseRecord(target, electronBuilderEnv, buildPaths.artifacts)'],
    ],
    output: '官方目标打包器增加 macOS ARM64/x64 unsigned 模式',
  })

  await applyPatch(source, {
    marker: 'OWNDSH-MAC-UNSIGNED',
    file: 'apps/desktop/scripts/smoke-packaged-runtime.ts',
    replacements: [
      [`const { values } = parseArgs({ options: { unsigned: { type: 'boolean', default: false } }, allowPositionals: false })
const target = resolveDesktopBuildTarget()
const windows = target === 'win-x64'
if (values.unsigned && !windows) throw new Error('desktop smoke: unsigned artifacts require Windows')
const artifacts = values.unsigned ? paths.unsignedArtifacts : paths.artifacts`,
        `const { values } = parseArgs({ options: {
  unsigned: { type: 'boolean', default: false },
  'unsigned-mac': { type: 'boolean', default: false },
}, allowPositionals: false })
const target = resolveDesktopBuildTarget()
const windows = target === 'win-x64'
const unsignedMac = values['unsigned-mac']
if (values.unsigned && unsignedMac) throw new Error('desktop smoke: unsigned modes are mutually exclusive')
if (values.unsigned && !windows) throw new Error('desktop smoke: unsigned artifacts require Windows')
if (unsignedMac && !target.startsWith('mac-')) throw new Error('desktop smoke: --unsigned-mac requires macOS')
const unsigned = values.unsigned || unsignedMac
const artifacts = unsigned ? paths.unsignedArtifacts : paths.artifacts`],
      ['if (windows && !values.unsigned) await verifyWindowsCode(application)', 'if (windows && !unsigned) await verifyWindowsCode(application)'],
    ],
    output: 'macOS unsigned 产物使用独立目录完成运行时冒烟检查',
  })
}
