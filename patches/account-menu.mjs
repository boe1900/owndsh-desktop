/**
 * [INPUT]: 官方 ui-settings-account 侧栏账号菜单
 * [OUTPUT]: OwnDsh 更多菜单只保留设置和已登录后的退出登录
 * [POS]: patches/ 的官方账号入口隔离接缝；企业登录由 owndsh-plugin 门禁负责
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { applyPatch } from './apply.mjs'

/**
 * 删除官方登录和反馈入口，避免 OwnDsh 暴露官方账号体系。
 * @param source - 临时官方 checkout 根目录
 */
export async function accountMenu(source) {
  await applyPatch(source, {
    marker: 'OWNDSH-ACCOUNT-MENU',
    file: 'packages/client/ui-settings-account/src/client/AccountMenu.tsx',
    replacements: [
      [`  Toast, Menu, IconEllipsisOutlineMedium, IconPaperPlaneOutlineMedium, IconSettingsOutlineMedium, IconUserOutlineMedium,`,
        `  Toast, Menu, IconEllipsisOutlineMedium, IconSettingsOutlineMedium,`],
      [`import { SignInDialog } from './SignInDialog.tsx'\n`, ''],
      [`  subscribeSessionExpired, subscribeModelSignInRequired, wide, settingsShortcut, openSettings, openOnboarding, settingsOpen,`,
        `  subscribeSessionExpired, subscribeModelSignInRequired, wide, settingsShortcut, openSettings, settingsOpen,`],
      [`  useAccount, useTheme, signOut, hasRunningAccountTasks, refreshAccount, bonusNoticeShown, bonusNoticeDismissed,\n  contactUs, showLogin, start, cancel, t,`,
        `  useAccount, signOut, hasRunningAccountTasks, refreshAccount, bonusNoticeShown, bonusNoticeDismissed,\n  t,`],
      [`  const colorScheme = useTheme(snapshot => snapshot.active.colorScheme)\n`, ''],
      [`  // The plugin's start publishes \`loginFailed\` before it rejects, so the dialog owns the report.\n  const beginSignIn = (): void => { setOpen(false); void start().catch(() => undefined) }\n`, ''],
      [`        { id: 'contact', label: t('contactUs'), icon: <IconPaperPlaneOutlineMedium size={16} /> },\n        ...(signedIn ? [{ id: 'signout', label: t('signOut'), icon: <LogoutIcon />, disabled: busy }]\n          : [{ id: 'signin', label: t('signIn'), icon: <IconUserOutlineMedium size={16} /> }]),`,
        `        ...(signedIn ? [{ id: 'signout', label: t('signOut'), icon: <LogoutIcon />, disabled: busy }] : []),`],
      [`        else if (id === 'contact') { setOpen(false); contactUs() }\n        else if (id === 'signin') beginSignIn()\n        else void requestSignOut()`,
        `        else void requestSignOut()`],
      [`    {account.loginVisible && !account.onboarding && <SignInDialog account={account} colorScheme={colorScheme}\n      start={start} cancel={cancel} t={t}\n      close={() => { showLogin(false) }} useApiKey={() => { showLogin(false); openOnboarding('deepseek-official') }} />}\n`, ''],
    ],
    output: '移除官方账号登录与意见反馈菜单项',
  })
}
