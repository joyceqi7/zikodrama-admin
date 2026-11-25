import { CircleCheck, CircleDashed, CircleX, Clock3, Radio } from 'lucide-react'
import { Tag } from 'antd'

interface StatusBadgeProps {
  value: string
  kind?: 'review' | 'publish' | 'media'
  label?: string
}

const labels: Record<string, string> = {
  draft: '草稿',
  publishing: '发布处理中',
  published: '已上线',
  unpublishing: '下架处理中',
  delisted: '已下架',
  not_submitted: '未送审',
  under_review: '审核中',
  approved: '已通过',
  rejected: '未通过',
  withdrawn: '已撤回',
  appealing: '申诉中',
  not_required: '无需送审',
  pending: '待上传',
  processing: '处理中',
  ready: '已就绪',
  failed: '失败',
  active: '启用',
  disabled: '停用',
}

function statusTone(value: string): string | undefined {
  if (value === 'published' || value === 'approved' || value === 'ready' || value === 'active') return 'success'
  if (value === 'rejected' || value === 'failed' || value === 'disabled') return 'error'
  if (value === 'under_review' || value === 'processing' || value === 'appealing' || value === 'publishing' || value === 'unpublishing') return 'warning'
  return undefined
}

function StatusIcon({ value }: { value: string }) {
  if (value === 'published') return <Radio size={13} />
  if (value === 'approved' || value === 'ready' || value === 'active') return <CircleCheck size={13} />
  if (value === 'rejected' || value === 'failed' || value === 'disabled') return <CircleX size={13} />
  if (value === 'under_review' || value === 'processing' || value === 'appealing' || value === 'publishing' || value === 'unpublishing') return <Clock3 size={13} />
  return <CircleDashed size={13} />
}

export function StatusBadge({ value, kind = 'publish', label }: StatusBadgeProps) {
  return (
    <Tag color={statusTone(value)} icon={<StatusIcon value={value} />} data-kind={kind}>
      {label ?? labels[value] ?? value}
    </Tag>
  )
}
