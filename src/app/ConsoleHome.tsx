import type { ReactNode } from 'react'
import { Button, Empty, Typography, type MenuProps } from 'antd'
import { ArrowUpRight } from 'lucide-react'
import { PageHeader, PageStack } from '../components/PageHeader'
import type { View } from './navigation'

interface ConsoleHomeProps {
  /** 当前管理员的显示名称，不包含账号凭据。 */
  displayName: string
  /** 与主导航共用的已授权菜单，保留服务端名称与顺序。 */
  items: MenuProps['items']
  /** 打开业务页面；调用方负责路由切换和草稿保护。 */
  onOpen: (view: View) => void
}

/** ConsoleHome 提供登录后的工作入口，仅展示会话菜单，不请求业务统计。 */
export function ConsoleHome({ displayName, items, onOpen }: ConsoleHomeProps) {
  const shortcuts = collectShortcuts(items)
  return (
    <section aria-labelledby="console-home-title">
      <PageStack>
        <PageHeader id="console-home-title" title="工作台" eyebrow={`欢迎回来，${displayName}。请选择要处理的工作。`} />
        {shortcuts.length ? (
          <nav className="console-home-shortcuts" aria-label="工作入口">
            {shortcuts.map((item) => (
              <Button className="console-home-shortcut" key={item.key} onClick={() => onOpen(item.view)}>
                <span className="console-home-shortcut-icon" aria-hidden="true">{item.icon}</span>
                <span className="console-home-shortcut-copy">
                  <Typography.Text strong>{item.label}</Typography.Text>
                  {item.directories.length > 0 && <Typography.Text type="secondary">{item.directories.map((label, index) => <span key={index}>{index > 0 && ' / '}{label}</span>)}</Typography.Text>}
                </span>
                <ArrowUpRight size={16} className="console-home-shortcut-arrow" aria-hidden="true" />
              </Button>
            ))}
          </nav>
        ) : <Empty description="暂无可用功能，请联系管理员分配权限。" />}
      </PageStack>
    </section>
  )
}

// 工作台复用主导航的授权结果，避免另外维护业务入口和权限规则。
function collectShortcuts(items: MenuProps['items'], directories: ReactNode[] = []): { key: string; view: View; label: ReactNode; icon: ReactNode; directories: ReactNode[] }[] {
  return (items ?? []).flatMap((item) => {
    if (!item || !('label' in item)) return []
    if ('children' in item) return collectShortcuts(item.children, [...directories, item.label])
    const key = String(item.key)
    return [{ key, view: key.split(':')[0] as View, label: item.label, icon: 'icon' in item ? item.icon : null, directories }]
  })
}
