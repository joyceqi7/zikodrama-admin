import { Alert, Button, Descriptions, Drawer, Input, Empty, Flex, Select, Table, Tag, Typography, type TableProps } from 'antd'
import { ReportDateRangePicker } from './ReportDateRangePicker'
import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { OperationsApi } from '../../api'
import { PageHeader, PageStack } from '../../components/PageHeader'
import { reportOperationFailure } from '../../operationErrors'
import type { TikTokPostbackEvent, TikTokPostbackLog, TikTokPostbackLogPage, TikTokPostbackLogQuery, TikTokPostbackOutcome } from '../../postbackLogs'

const eventLabels: Record<TikTokPostbackEvent, string> = {
  video_play_request: '播放请求',
  ep_play: '实际播放',
  minis_ad_show: '广告展示',
}
const outcomeLabels: Record<TikTokPostbackOutcome, string> = { attempt: '等待回调', success: 'SDK 已接受', failure: '调用失败', unknown: '结果未知', skipped: '未调用' }
const outcomeColors: Record<TikTokPostbackOutcome, string> = { attempt: 'processing', success: 'success', failure: 'error', unknown: 'warning', skipped: 'default' }

interface Props {
  // api 提供当前应用下的认证日志查询。
  api: OperationsApi
  // applicationId 指定日志所属应用；切换应用时由外壳重建页面。
  applicationId: string
  // applicationName 用于页面上下文说明。
  applicationName?: string
  // notify 展示经过统一映射的错误提示。
  notify(message: string, tone?: 'success' | 'error'): void
}

// defaultPostbackRange 默认查询七个 UTC 自然日，历史九十天仍可通过日期筛选查看。
function defaultPostbackRange(): Pick<TikTokPostbackLogQuery, 'from' | 'to'> {
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 6)
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }
}

// TikTokPostbackLogList 按事件和结果筛选关键行为回传事实，并提供稳定游标分页。
export function TikTokPostbackLogList({ api, applicationId, applicationName, notify }: Props) {
  const [selected, setSelected] = useState<TikTokPostbackLog | null>(null)
  const [query, setQuery] = useState<TikTokPostbackLogQuery>(() => ({ pageSize: 20, ...defaultPostbackRange() }))
  const [draft, setDraft] = useState<Omit<TikTokPostbackLogQuery, 'cursor' | 'pageSize'>>(defaultPostbackRange)
  const [cursors, setCursors] = useState<string[]>([''])
  const [result, setResult] = useState<TikTokPostbackLogPage | null>(null)
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let active = true
    setResult(null); setFailure('')
    if (!applicationId) { setLoading(false); return () => { active = false } }
    setLoading(true)
    void api.listTikTokPostbackLogs(query, applicationId).then((next) => {
      if (active) setResult(next)
    }).catch((error: unknown) => {
      const message = reportOperationFailure('加载 TikTok 回传日志失败', error)
      if (active) { setFailure(message); notify(message, 'error') }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, applicationId, query, refresh, notify])

  const resetPage = (next: TikTokPostbackLogQuery) => {
    setCursors(['']); setResult(null); setQuery(next)
  }
  const applyFilters = () => resetPage({ pageSize: query.pageSize, ...draft })
  const resetFilters = () => { const range = defaultPostbackRange(); setDraft(range); resetPage({ pageSize: query.pageSize, ...range }) }
  const formatUTC = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.valueOf()) ? '—' : `${date.toLocaleString('zh-CN', { hour12: false, timeZone: 'UTC' })} UTC`
  }
  const scenes: Record<string, string> = { playback: '播放', entry_reward: '入剧激励', episode_unlock: '分集解锁', vip_reward: 'VIP 激励', home_interstitial: '首页插屏', pause_interstitial: '暂停插屏' }
  const reasons: Record<string, string> = { sdk_rejected: 'SDK 拒绝', exception: '调用异常', unsupported: '能力不可用', identity_changed: '身份已切换', identity_missing: '身份缺失', callback_timeout: '10 秒未收到回调', invalid_params: '参数无效' }
  const warnings: Record<string, string> = { missing_drama_context: '缺少剧目上下文', missing_previous_episode: '没有实际播放的上一集', unknown_last_episode: '无法确定是否最后一集' }
  const columns: TableProps<TikTokPostbackLog>['columns'] = [
    { title: '事件类型', dataIndex: 'event', width: 140, render: (value: TikTokPostbackEvent) => eventLabels[value] },
    { title: '状态', dataIndex: 'outcome', width: 110, render: (value: TikTokPostbackOutcome) => <Tag color={outcomeColors[value]}>{outcomeLabels[value]}</Tag> },
    { title: '场景 / 构建', width: 180, render: (_, row) => row.details ? <>{scenes[row.details.scene]}<br /><Typography.Text code>{row.details.clientVersion}</Typography.Text></> : '未采集' },
    { title: '耗时 / 错误码', width: 150, render: (_, row) => <>{row.details?.elapsedMs === undefined ? '—' : `${Math.round(row.details.elapsedMs)} ms`}<br />{row.details?.errorCode || '—'}</> },
    { title: '用户 ID', dataIndex: 'userId', width: 210, render: (value: string) => <Typography.Text code copyable>{value}</Typography.Text> },
    { title: '事实 ID', dataIndex: 'eventId', width: 250, ellipsis: true, render: (value: string) => <Typography.Text code copyable ellipsis={{ tooltip: value }}>{value}</Typography.Text> },
    { title: '发生时间', dataIndex: 'occurredAt', width: 210, render: formatUTC },
    { title: '接收时间', dataIndex: 'receivedAt', width: 210, render: formatUTC },
    { title: '操作', width: 100, fixed: 'right', render: (_, row) => <Button size="small" onClick={() => setSelected(row)}>查看详情</Button> },
  ]

  return <section aria-labelledby="postback-logs-title" aria-busy={loading}>
    <PageStack>
      <PageHeader title="回传日志" id="postback-logs-title" eyebrow={`查看 ${applicationName || applicationId || '当前应用'} 的 TikTok 关键行为回传事实，默认最近 7 天，可查询最近 90 天。`} actions={<Button size="small" icon={<RefreshCw size={16} />} loading={loading} disabled={!applicationId} onClick={() => { resetPage({ ...query, cursor: undefined }); setRefresh((value) => value + 1) }}>刷新</Button>} />
      <Flex gap="middle" wrap align="end" data-ui="postback-log-filters">
        <Flex vertical gap={4}><label htmlFor="postback-event">事件类型</label><Select id="postback-event" aria-label="事件类型" allowClear placeholder="全部事件" value={draft.event} onChange={(event) => setDraft((current) => ({ ...current, event }))} options={(Object.keys(eventLabels) as TikTokPostbackEvent[]).map((value) => ({ value, label: eventLabels[value] }))} /></Flex>
        <Flex vertical gap={4}><label htmlFor="postback-outcome">状态</label><Select id="postback-outcome" aria-label="状态" allowClear placeholder="全部状态" value={draft.outcome} onChange={(outcome) => setDraft((current) => ({ ...current, outcome }))} options={(Object.keys(outcomeLabels) as TikTokPostbackOutcome[]).map((value) => ({ value, label: outcomeLabels[value] }))} /></Flex>
        <ReportDateRangePicker id="postback-date" from={draft.from || ''} to={draft.to || ''} onChange={(from, to) => setDraft(current => ({ ...current, from: from || undefined, to: to || undefined }))} />
        <Flex vertical gap={4}><label htmlFor="postback-scene">场景</label><Select style={{ width: 150 }} id="postback-scene" aria-label="场景" allowClear placeholder="全部场景" value={draft.scene} options={Object.entries(scenes).map(([value, label]) => ({ value, label }))} onChange={scene => setDraft(current => ({ ...current, scene }))} /></Flex>
        <Flex vertical gap={4}><label htmlFor="postback-version">构建版本</label><Input id="postback-version" maxLength={64} style={{ width: 160 }} value={draft.clientVersion || ''} placeholder="精确构建修订" onChange={e => setDraft(current => ({ ...current, clientVersion: e.target.value.trim() || undefined }))} /></Flex>
        <Flex vertical gap={4}><label htmlFor="postback-code">错误码</label><Input id="postback-code" maxLength={12} style={{ width: 130 }} value={draft.errorCode || ''} placeholder="官方数值错误码" onChange={e => setDraft(current => ({ ...current, errorCode: e.target.value.trim() || undefined }))} /></Flex>
        <Button type="primary" disabled={!applicationId} onClick={applyFilters}>查询</Button>
        <Button onClick={resetFilters}>重置</Button>
      </Flex>
      <Typography.Text type="secondary">SDK 已接受仅表示调用成功，不证明 TikTok 入库、归因或计费曝光。计数保留 90 天，脱敏参数保留 7 天；按场景、构建和错误码筛选只匹配有明细的记录。</Typography.Text>
      {failure && <Alert type="error" showIcon title={failure} action={<Button size="small" onClick={() => setRefresh((value) => value + 1)}>重试</Button>} />}
      <Table<TikTokPostbackLog> size="small" rowKey={(row) => `${row.userId}:${row.eventId}:${row.outcome}`} columns={columns} dataSource={result?.items ?? []} loading={loading} scroll={{ x: 1600 }} pagination={false}
        locale={{ emptyText: <Empty description={!applicationId ? '请先选择应用' : failure ? '回传日志加载失败，请重试' : loading ? '正在加载回传日志…' : '暂无回传日志'} /> }} />
      <Flex gap="middle" align="center" justify="end" wrap aria-label="回传日志分页">
        <Typography.Text role="status">第 {cursors.length} 页 · 本页 {result?.items.length ?? 0} 条</Typography.Text>
        <Select aria-label="每页条数" value={query.pageSize} disabled={loading || !applicationId} options={[20, 50, 100].map((value) => ({ value, label: `${value} 条/页` }))} onChange={(pageSize) => resetPage({ ...query, pageSize, cursor: undefined })} />
        <Button disabled={loading || cursors.length === 1 || !applicationId} onClick={() => {
          const previous = cursors.slice(0, -1)
          setCursors(previous); setResult(null); setQuery({ ...query, cursor: previous.at(-1) || undefined })
        }}>上一页</Button>
        <Button disabled={loading || !result?.hasMore || !result.nextCursor || !applicationId} onClick={() => {
          if (!result?.nextCursor) return
          setCursors((current) => [...current, result.nextCursor]); setQuery({ ...query, cursor: result.nextCursor }); setResult(null)
        }}>下一页</Button>
      </Flex>
      <Drawer title="回传详情" open={!!selected} onClose={() => setSelected(null)} styles={{ wrapper: { width: 'min(760px, 100vw)' } }}>
        {selected && <>
          <Alert type="info" showIcon title="仅记录提交 SDK 的业务参数" description="SDK 自动附加的时间戳、消息 ID 和传输封装不在此快照中。客户端成功回调无法证明平台入库或归因。" />
          <Descriptions column={1} size="small" style={{ marginTop: 20 }} items={[
            { key: 'id', label: '事实 ID', children: selected.eventId },
            { key: 'event', label: '事件', children: selected.event },
            { key: 'state', label: '结果', children: outcomeLabels[selected.outcome] },
            { key: 'scene', label: '场景', children: scenes[selected.details?.scene || ''] || '未采集' },
            { key: 'build', label: '构建版本', children: selected.details?.clientVersion || '未采集' },
            { key: 'elapsed', label: '耗时', children: selected.details?.elapsedMs === undefined ? '—' : `${Math.round(selected.details.elapsedMs)} ms` },
            { key: 'reason', label: '原因', children: reasons[selected.details?.reason || ''] || '—' },
            { key: 'code', label: '错误码 / 子码', children: `${selected.details?.errorCode || '—'} / ${selected.details?.subErrorCode || '—'}` },
            { key: 'message', label: '脱敏消息', children: selected.details?.errorMessage || '—' },
          ]} />
          {selected.details ? <>
            {(selected.details.warnings ?? []).length > 0 && <Alert type="warning" title={(selected.details.warnings ?? []).map(w => warnings[w] || w).join('；')} />}
            <Typography.Paragraph type="secondary">以下保留省略、空字符串与 null 的区别。广告的 episode_number 是实际播放的上一集；if_first_time 沿用本次 Mini 运行会话，官方文档未定义跨会话范围。</Typography.Paragraph>
            <Table size="small" pagination={false} rowKey="name" scroll={{ x: 420 }} columns={[{ title: '参数', dataIndex: 'name' }, { title: '值', dataIndex: 'value', render: value => <code style={{ overflowWrap: 'anywhere' }}>{value}</code> }]} dataSource={['minis_drama_name', 'minis_drama_id', 'episode_number', 'if_last_ep', ...(selected.event === 'minis_ad_show' ? ['if_first_time', 'minis_name', 'minis_id', 'open_id', 'ad_type'] : [])].map(name => ({ name, value: Object.hasOwn(selected.details!.params, name) ? JSON.stringify(selected.details!.params[name]) : '未传入' }))} />
            <Typography.Paragraph style={{ marginTop: 16 }}>脱敏快照（可选择复制）</Typography.Paragraph>
            <Input.TextArea aria-label="脱敏回传快照" readOnly autoSize={{ minRows: 8, maxRows: 18 }} value={JSON.stringify(selected, null, 2)} />
          </> : <Empty description="旧版未采集或明细已过期" />}
        </>}
      </Drawer>
    </PageStack>
  </section>
}
