import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Descriptions, Flex, Modal, Select, Table, Tag, Typography } from 'antd'
import { ApiError, type OperationsApi } from '../../api'
import type { PublicationRecord, PublicationRecordKind } from '../../publicationRecords'
import { publicationContentLabel } from './publicationContent'
import { reviewFeedback } from './reviewFeedback'
import { toUserMessage } from '../../userMessage'
import { PageHeader, PageStack } from '../../components/PageHeader'
import { reportDramaFailure } from './dramaEditorErrors'

const labels: Record<string, string> = { queued: '等待处理', processing: '处理中', under_review: '审核中', approved: '审核通过', rejected: '审核未通过', withdrawn: '已撤回', failed: '处理失败', online: '已上线', offline: '已下架', publishing: '上线中', unpublishing: '下架中', superseded: '已替换' }
interface Props {
  /** 受鉴权的管理接口。 */
  api: OperationsApi
  /** 记录所属流程。 */
  kind: PublicationRecordKind
  /** 可选的短剧筛选。 */
  dramaId?: string
  /** 从记录返回官方列表详情，仍保留独立的内容草稿。 */
  onBack?: () => void
  /** 按短剧打开官方列表详情，历史页不另建一套发布流程。 */
  onOpenOfficial?: (dramaId: string) => void
}
/** PublicationRecordsPage 只读展示冻结的审核与上线历史；流程操作统一回官方发布列表。 */
export function PublicationRecordsPage({ api, kind, dramaId, onBack, onOpenOfficial }: Props) {
  const [rows, setRows] = useState<PublicationRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<PublicationRecord | null>(null)
  const generation = useRef(0)
  const load = useCallback(async () => {
    const request = ++generation.current
    setLoading(true)
    setError('')
    try {
      const result = await api.listPublicationRecords(kind, { page, pageSize: 20, status, dramaId })
      if (request === generation.current) {
        setRows(result.items); setTotal(result.total)
        setDetail(current => current ? result.items.find(row => row.id === current.id) ?? current : null)
      }
    } catch (reason) {
      const message = reportDramaFailure('load publication records failed', reason)
      if (request === generation.current) setError(message)
    } finally { if (request === generation.current) setLoading(false) }
  }, [api, kind, page, status, dramaId])
  const invalidate = useCallback(() => { generation.current++ }, [])
  useEffect(() => { void load(); return invalidate }, [load, invalidate])
  const hasRunning = rows.some(row => ['queued', 'processing', 'under_review', 'publishing', 'unpublishing'].includes(row.status))
  useEffect(() => {
    if (!hasRunning) return
    let active = true
    let timer = 0
    const refresh = async () => {
      await load()
      if (active) timer = window.setTimeout(refresh, 5000)
    }
    timer = window.setTimeout(refresh, 5000)
    return () => { active = false; window.clearTimeout(timer) }
  }, [hasRunning, load])
  const choices = kind === 'reviews' ? ['queued', 'processing', 'under_review', 'approved', 'rejected', 'withdrawn', 'failed'] : ['publishing', 'online', 'unpublishing', 'offline', 'failed', 'superseded']
  const time = (value?: string) => value && !value.startsWith('0001-') ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '未记录'
  return <PageStack>
    <PageHeader onBack={onBack} backLabel="返回官方发布" title={kind === 'reviews' ? '审核记录' : '上线记录'} eyebrow={kind === 'reviews' ? '查看实际送审内容与审核意见；上线异常不会改变审核结论' : '查看每次上线的内容范围、完成时间与后续上下架状态'} actions={<Button loading={loading} onClick={() => void load()}>刷新</Button>} />
    <Flex gap={12} align="center" wrap>
      <Select aria-label="记录状态" placeholder="全部状态" allowClear style={{ width: 180 }} value={status} options={choices.map(value => ({ value, label: labels[value] }))} onChange={value => { setStatus(value); setPage(1) }} />
      <Typography.Text type="secondary">{dramaId ? `短剧 ${dramaId} · ` : ''}共 {total} 条记录</Typography.Text>
    </Flex>
    {error && <Alert type="error" showIcon title={error} />}
    <Table<PublicationRecord> size="small" rowKey="id" loading={loading} dataSource={rows} scroll={{ x: 980 }} pagination={{ current: page, pageSize: 20, total, showSizeChanger: false, onChange: setPage }} columns={[
      { title: '短剧 / 处理内容', key: 'title', render: (_, row) => <Flex vertical gap={4}><Typography.Text strong>{row.title || `短剧 ${row.dramaId}`}</Typography.Text><Typography.Text type="secondary">{publicationContentLabel(row.publication)}</Typography.Text></Flex> },
      { title: '状态', key: 'status', width: 140, render: (_, row) => <Tag color={['approved', 'online'].includes(row.status) ? 'green' : ['failed', 'rejected'].includes(row.status) ? 'red' : 'default'}>{row.status === 'rejected' && row.publication.reviewStatus === 4 ? '已撤回' : labels[row.status] || row.status}</Tag> },
      { title: kind === 'reviews' ? '实际送审时间' : '上线申请时间', key: 'submitted', width: 190, render: (_, row) => time(kind === 'reviews' ? row.publication.submittedAt : row.createdAt) },
      ...(kind === 'releases' ? [{ title: '上线完成时间', key: 'onlineAt', width: 190, render: (_: unknown, row: PublicationRecord) => time(row.publication.onlineAt) }] : []),
      { title: '更新时间', dataIndex: 'updatedAt', width: 190, render: time },
      { title: '操作', key: 'actions', width: 260, render: (_, row) => <Flex gap={8} wrap><Button size="small" onClick={() => setDetail(row)}>详情</Button>{onOpenOfficial && <Button size="small" onClick={() => onOpenOfficial(row.dramaId)}>官方发布</Button>}</Flex> },
    ]} />
    <Modal title="记录详情" open={Boolean(detail)} onCancel={() => setDetail(null)} footer={<Button onClick={() => setDetail(null)}>关闭</Button>}>
      {detail && <><Descriptions column={1} items={[
        { key: 'title', label: '短剧', children: detail.title },
        { key: 'id', label: '记录 ID', children: detail.id },
        { key: 'content', label: '处理内容', children: publicationContentLabel(detail.publication) },
        { key: 'count', label: '完整内容', children: detail.publication.contentSummary ? `共 ${detail.publication.contentSummary.episodeNumbers.length} 集` : '历史范围未记录' },
        { key: 'version', label: '平台版本', children: detail.publication.platformVersion || '尚未生成' },
        { key: 'actor', label: '发起人', children: detail.actorName ? `${detail.actorName}${detail.actorId ? `（${detail.actorId}）` : ''}` : detail.actorId || '历史记录未记录' },
        { key: 'priority', label: '审核优先级', children: detail.publication.priority === 'urgent' ? '加急' : '普通' },
        { key: 'review', label: '审核 ID', children: detail.publication.reviewId || '尚未生成' },
        ...(detail.status === 'failed' ? [{ key: 'stage', label: '异常环节', children: kind === 'reviews' ? detail.publication.stage === 'submit_review' ? '提交审核' : '审核结果查询' : detail.publication.stage === 'delist_album' ? '下架' : '上线' }] : []),
        { key: 'error', label: '错误代码', children: detail.publication.errorCode || '无' },
        { key: 'diagnostic', label: '底层分类', children: detail.publication.diagnosticCode || '未记录' },
      ]} />
      {detail.publication.reviewFailReasons?.map((reason, index) => {
        const feedback = reviewFeedback(reason, detail.publication)
        return <Alert key={index} type="warning" title={feedback.label} description={<Flex vertical gap={2}>{feedback.itemId && <Typography.Text type="secondary" copyable={{ text: feedback.itemId }}>TikTok Episode ID：{feedback.itemId}</Typography.Text>}<Typography.Text>{feedback.message}</Typography.Text></Flex>} />
      })}
      {detail.publication.errorCode && <Alert type="error" title={toUserMessage(new ApiError('', 0, detail.publication.errorCode), '请返回官方发布查看当前处理状态与恢复方式')} />}
      {detail.publication.appeal && <Descriptions title="最近一次申诉" column={1} items={[
        { key: 'object', label: '申诉对象', children: `${detail.publication.appeal.itemType === 1 ? '剧目' : '剧集'} · ${detail.publication.appeal.itemId}` },
        { key: 'reason', label: '申诉理由', children: detail.publication.appeal.reason },
        { key: 'attachments', label: '证据链接', children: `${detail.publication.appeal.attachmentUrls?.length || 0} 条` },
      ]} />}
      {kind === 'reviews' && detail.status === 'approved' && <Alert type="success" title="本次内容已通过审核" description="审核通过不等于已经上线，请在官方发布列表确认上线，或查看上线记录。" />}
      {kind === 'releases' && detail.publication.onlineAt && <Typography.Paragraph>本次内容曾于 {time(detail.publication.onlineAt)} 上线成功；后续替换或下架不改变这次上线事实。</Typography.Paragraph>}
      {!detail.current && <Typography.Paragraph type="secondary">这是历史版本，仅供查看。</Typography.Paragraph>}</>}
    </Modal>
  </PageStack>
}
