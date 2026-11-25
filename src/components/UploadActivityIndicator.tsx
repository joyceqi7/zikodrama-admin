import { Badge, Button, Drawer, Flex, Progress, Space, Typography } from 'antd'
import { CloudUpload } from 'lucide-react'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { UploadActivityStore } from '../media/uploadActivity'

// UploadActivityIndicator 在全局外壳展示当前标签页的上传进度，切换业务页面后仍可查看。
export function UploadActivityIndicator({ store, compact = false }: { store: UploadActivityStore; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const activities = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot)
  const active = activities.filter((activity) => activity.status === 'uploading')
  const progress = useMemo(() => active.length > 0
    ? Math.round(active.reduce((sum, activity) => sum + activity.progress, 0) / active.length)
    : 100, [active])
  useEffect(() => {
    if (active.length === 0) return
    const warnBeforeClosing = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warnBeforeClosing)
    return () => window.removeEventListener('beforeunload', warnBeforeClosing)
  }, [active.length])
  if (activities.length === 0) return null

  return (
    <>
      <Badge count={active.length || undefined} size="small">
        <Button icon={<CloudUpload size={16} />} onClick={() => setOpen(true)} aria-label={`查看上传任务，${active.length} 个进行中`}>
          {!compact && (active.length > 0 ? `上传中 ${progress}%` : '上传任务')}
        </Button>
      </Badge>
      <Drawer title="上传任务" open={open} onClose={() => setOpen(false)} size="default">
        <Flex vertical gap="middle">
          <Typography.Text type="secondary">站内切换页面不会中断；刷新或关闭标签页后需重新选择原文件恢复。</Typography.Text>
          {activities.map((activity) => (
            <Flex key={activity.id} vertical gap={4}>
              <Space><Typography.Text ellipsis>{activity.fileName}</Typography.Text><Typography.Text type="secondary">{activity.status === 'uploading' ? `${activity.progress}%` : activity.status === 'succeeded' ? '已上传' : '上传失败'}</Typography.Text></Space>
              <Progress percent={activity.progress} status={activity.status === 'failed' ? 'exception' : activity.status === 'succeeded' ? 'success' : 'active'} />
            </Flex>
          ))}
        </Flex>
      </Drawer>
    </>
  )
}
