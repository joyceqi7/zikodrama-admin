# 后台模块边界

- `App.tsx` 只负责运行配置读取与接口实例装配。
- `app/OperationsConsole.tsx` 组合会话、导航和按需加载的页面；`navigation.tsx` 维护固定菜单与权限映射，`theme.ts` 维护外观。
- `features/auth` 负责登录与会话恢复，不加载其他业务的数据。
- `features/dramas` 负责短剧列表、详情编辑、分集上传、发布与分发授权。`useDramaCatalog` 管理目录和当前详情，媒资不另设独立业务模块。
- `features/applications` 负责小程序应用管理。
- `features/monetization` 负责当前小程序独立策略与消费配置。策略使用完整编辑页：桌面左侧选择规则、右侧编辑，手机使用规则选择器；权益效果实时说明，保存错误定位到对应规则。返回、切换菜单、退出和刷新均保护未保存草稿。新增策略默认归属右上角当前小程序，IAA/IAP/IAA+IAP 决定可添加的获取方式；页面不提供手工绑定。
- `features/growth` 负责投放和仪表盘。
- `features/system` 负责用户、角色、权限、全局配置和审计。
- `components` 只保留跨模块 UI；`shared` 放跨模块合同；`api.ts` 负责 HTTP 适配，`domain.ts` 定义接口合同。

业务组件和测试放在所属模块内。模块内部使用相对导入；不要通过汇总导出文件静态引入所有页面，保留页面按需加载。页面状态由所属模块维护，应用外壳只组合模块和共享的应用选择上下文。

验证：`npx pnpm@11.11.0 verify`。
