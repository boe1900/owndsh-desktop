# patches/
> L2 | 父级: ../CLAUDE.md

apply.mjs: 断言式替换底座，锚点默认恰好出现一次，重复文本显式声明次数；按目标语言生成单个 L3 头部，保留 shebang/@echo off，并兼容旧块头部；不持有业务逻辑
apply.test.mjs: 共享底座回归验收，验证多补丁标记折叠、旧头部迁移、脚本首行与当前平台解释器执行
login-gate.mjs: 掐断官方登录入口，needsWelcome 恒为 false 并删除登出与会话过期两处重弹回路
plugin-seed.mjs: 首次 profile 只播种 owndsh-plugin bundle，把包登记到 dsh 运行时依赖树，并迁移旧 profile 的 OwnDsh 精确版本；避免 rc3 离线直接依赖元数据查询
branding.mjs: 切换 OwnDsh Desktop 产品名、appId 默认值、外部协议和平台图标，声明 macOS 本地网络用途
cli-isolation.mjs: 将全局 CLI 命令改为 owndsh，负责启动器内容与名称，并隔离 macOS 收据、Windows 注册表和 PATH 探测
data-isolation.mjs: 在 main process 启动早期设置独立 DSH_HOME、userData 和 sessionData
packaging.mjs: 打包配置接缝，策略 origin 未配置时跳过强制更新策略注入
github-updates.mjs: unsigned 包改用 OwnDsh GitHub Release 的 nightly 更新源，签名发行路径保留官方配置
account-menu.mjs: 从右下角更多菜单移除官方登录与意见反馈，保留设置和已登录后的退出登录
index.mjs: 聚合入口，applyPatches 依次施加全部补丁；新增补丁在此登记
patches.test.mjs: 沙箱副本上的全接缝断言验收，npm test 的执行对象

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
