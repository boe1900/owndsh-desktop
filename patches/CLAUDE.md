# patches/
> L2 | 父级: ../CLAUDE.md

apply.mjs: 断言式替换底座，每个锚点在官方源码中必须恰好出现一次，改动即失败；不持有业务逻辑
login-gate.mjs: 掐断官方登录入口，needsWelcome 恒为 false 并删除登出与会话过期两处重弹回路
plugin-seed.mjs: 首次 profile 播种 owndsh-plugin 且加入官方运行树，卸载后不复活
packaging.mjs: 打包配置接缝，策略 origin 未配置时跳过强制更新策略注入
index.mjs: 聚合入口，applyPatches 依次施加全部补丁；新增补丁在此登记
patches.test.mjs: 沙箱副本上的全接缝断言验收，npm test 的执行对象

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
