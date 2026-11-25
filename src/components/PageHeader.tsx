import { Button, Divider, Flex, Space, Typography, type FlexProps } from 'antd'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

interface PageHeaderProps {
  /** 当前页面或分区名称。 */
  title: string
  /** 标题下方的业务说明。 */
  eyebrow?: string
  /** 供区域无障碍名称关联的标题标识。 */
  id?: string
  /** 当前权限允许显示的操作。 */
  actions?: ReactNode
  /** 返回入口；草稿保护由调用方负责。 */
  onBack?: () => void
  /** 返回按钮的无障碍名称。 */
  backLabel?: string
  /** 是否显示标题区底部分隔线。 */
  divider?: boolean
}

/** PageHeader 统一页面标题、返回入口与主操作的层级。 */
export function PageHeader({ title, eyebrow, id, actions, onBack, backLabel = '返回', divider = true }: PageHeaderProps) {
  return (
    <Flex vertical gap={8} data-ui="page-header">
      <Flex align="center" justify="space-between" gap="middle" wrap>
        <Space align="start" size="middle">
          {onBack && <Button type="text" icon={<ArrowLeft size={18} />} onClick={onBack} aria-label={backLabel} />}
          <Space orientation="vertical" size={2}>
            <Typography.Title id={id} level={3}>{title}</Typography.Title>
            {eyebrow && <Typography.Text type="secondary">{eyebrow}</Typography.Text>}
          </Space>
        </Space>
        {actions && <Space wrap>{actions}</Space>}
      </Flex>
      {divider && <Divider />}
    </Flex>
  )
}

interface SectionHeaderProps {
  /** 当前页面或分区名称。 */
  title: string
  /** 分区标题的辅助图标。 */
  icon?: ReactNode
  /** 当前权限允许显示的操作。 */
  actions?: ReactNode
}

/** SectionHeader 呈现页面内分区标题及局部操作。 */
export function SectionHeader({ title, icon, actions }: SectionHeaderProps) {
  return (
    <Flex align="center" justify="space-between" gap="middle" wrap>
      <Space>
        {icon}
        <Typography.Title level={5}>{title}</Typography.Title>
      </Space>
      {actions && <Space wrap>{actions}</Space>}
    </Flex>
  )
}

/** PageStack 使用一致间距排列页面内容。 */
export function PageStack({ children, ...props }: FlexProps) {
  return <Flex vertical gap={12} {...props}>{children}</Flex>
}
