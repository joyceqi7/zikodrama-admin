import { useEffect, useState } from 'react'
import { Alert, Button, Drawer, Flex, Table, Tag, Typography, type TableProps } from 'antd'
import type { DramaDistribution, OperationsApi } from '../../api'
import type { DistributionApplication } from '../../applications'
import type { DramaListItem } from '../../domain'
import { reportDramaFailure } from './dramaEditorErrors'
import { DramaDistributionPanel } from './DramaDistributionPanel'

interface Props {
  /** 复用已有短剧读取权限下的授权进度接口。 */
  api: OperationsApi
  /** 点击时绑定的短剧，发布方不计入其他小程序授权。 */
  drama: DramaListItem
  /** 目录已加载的小程序身份；缺失名称时显示内部 ID。 */
  applications: DistributionApplication[]
  /** canUpdate 允许在抽屉内选择授权、撤权和恢复失败目标；默认仍只读。 */
  canUpdate?: boolean
  /** 关闭明细并取消本次读取结果的展示。 */
  onClose: () => void
  /** 手动刷新明细后同步刷新列表中的授权数。 */
  onRefresh: () => void
}

const labels: Record<DramaDistribution['status'], string> = { pending: '处理中', authorized: '已授权', revoked: '未授权', failed: '授权失败', attention_required: '需人工处理' }

// DramaAuthorizationDrawer 按权限承载授权维护或只读明细，发布方不计入其他小程序授权。
export function DramaAuthorizationDrawer({ api, drama, applications, canUpdate = false, onClose, onRefresh }: Props) {
  const [rows, setRows] = useState<DramaDistribution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (canUpdate) return
    let active = true
    setLoading(true); setError('')
    void api.listDramaDistributions(drama.id).then(next => {
      if (active) setRows(next)
    }).catch(cause => {
      const message = reportDramaFailure('load drama authorization details failed', cause)
      if (active) setError(message)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, canUpdate, drama.id, revision])
  const ownerId = drama.ownerApplicationId || rows[0]?.ownerApplicationId
  const owner = applications.find(app => app.id === ownerId)
  const targets = rows.filter(row => row.applicationId !== ownerId)
  const columns: TableProps<DramaDistribution>['columns'] = [
    { title: '小程序', key: 'application', render: (_, row) => <Flex vertical><Typography.Text>{applications.find(app => app.id === row.applicationId)?.name || row.applicationId}</Typography.Text><Typography.Text type="secondary">ID：{row.applicationId}</Typography.Text></Flex> },
    { title: '授权状态', key: 'status', width: 140, render: (_, row) => {
      // 已撤销本地可见性时，即使平台历史结果仍为 authorized，也不展示为可用授权。
      const authorized = row.enabled && row.desiredAuthorized && row.status === 'authorized'
      const label = row.status === 'authorized' && !authorized ? '撤权处理中' : labels[row.status]
      return <Tag color={authorized ? 'green' : ['failed', 'attention_required'].includes(row.status) ? 'red' : undefined}>{label}</Tag>
    } },
  ]
  return <Drawer open title={`${drama.title} · 授权明细`} onClose={onClose} size={640}>
    {canUpdate ? <DramaDistributionPanel key={drama.id} api={api} dramaId={drama.id} ownerApplicationId={drama.ownerApplicationId} applications={applications} canUpdate onChanged={onRefresh} /> :
    <Flex vertical gap={16}>
      <Alert type="info" showIcon title="仅统计已确认授权成功的其他小程序，不含发布方" description="授权中、失败及已失效的授权不计入。列表数字和明细以系统最近同步结果为准。" />
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Typography.Text>发布方：{owner?.name || ownerId || '未知'} <Tag color="blue">自动可用 · 不计入授权数</Tag></Typography.Text>
        <Button aria-label="刷新授权状态" disabled={loading} loading={loading} onClick={() => { setRevision(value => value + 1); onRefresh() }}>刷新状态</Button>
      </Flex>
      {error ? <Alert type="error" showIcon title={error} action={<Button aria-label="重试加载授权明细" onClick={() => setRevision(value => value + 1)}>重试</Button>} /> : <Table rowKey="applicationId" size="small" columns={columns} dataSource={targets} loading={loading} pagination={false} locale={{ emptyText: '暂无其他小程序授权记录' }} />}
    </Flex>}
  </Drawer>
}
