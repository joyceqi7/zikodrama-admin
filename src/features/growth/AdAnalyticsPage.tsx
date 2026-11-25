import { useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Collapse, Descriptions, Drawer, Empty, Flex, Input, Row, Select, Statistic, Table, Tag, Typography, type TableProps } from 'antd'
import { RefreshCw } from 'lucide-react'
import type { OperationsApi } from '../../api'
import type { AdAnalytics, AdItem, AdQuery, AdSummary } from '../../adAnalytics'
import { PageHeader, PageStack } from '../../components/PageHeader'
import { reportOperationFailure } from '../../operationErrors'
import { ReportDateRangePicker } from './ReportDateRangePicker'

const today = () => new Date().toISOString().slice(0, 10)
const scenes: Record<string, string> = { entry_reward: '入剧激励', episode_unlock: '分集解锁', vip_reward: 'VIP 激励', home_interstitial: '首页插屏', pause_interstitial: '暂停插屏' }
const phases: Record<string, string> = { ad_trigger: '业务调用', ad_create: '创建调用', ad_created: '取得实例', ad_request: '展示请求', ad_shown: '确认展示', ad_complete: '激励完播', ad_closed: '原生关闭', ad_cancelled: '未完播 / 取消', ad_failure: '明确错误', ad_skipped: '本地拦截', ad_show_unknown: '展示结果未知', ad_close_unknown: '关闭结果未知' }
const reasons: Record<string, string> = { unsupported: '能力不可用', busy: '原生广告仍在处理', not_visible: '页面不在前台', stale_intent: '原展示意图已失效', container_suspended: '等待前台恢复或手动重试', container_unavailable: '50008 · 宿主容器不可用', cooldown: '客户端冷却期', exception: '能力检测异常', sdk_error: 'SDK 明确错误', ad_active_conflict: '11006 · 宿主广告活动冲突', user_cancel: '用户取消', not_completed: '未完整观看', callback_timeout: '等待超时', container_destroyed: '容器已销毁' }
const stages: Record<string, string> = { gate: '本地门禁', capability: '能力检查', create: '创建', setup: '注册回调', show: '展示', callback: 'SDK 错误回调', close: '关闭', destroy: '容器销毁' }
const ms = (value?: number | null) => value == null ? '—' : `${Math.round(value)} ms`
const utc = (value: string) => `${new Date(value).toLocaleString('zh-CN', { timeZone: 'UTC', hour12: false })} UTC`

// AdAnalyticsPage 使用独立菜单与读取权限展示客户端广告漏斗，不能替代平台结算报表。
export function AdAnalyticsPage({ api, applicationId, applicationName, notify }: {
  /** api 复用认证应用查询。 */
  api: OperationsApi
  /** applicationId 是可信内部应用标识，切换时由外壳重建页面。 */
  applicationId: string
  /** applicationName 提供当前查询上下文。 */
  applicationName?: string
  /** notify 展示统一映射后的错误。 */
  notify(message: string, tone?: 'success' | 'error'): void
}) {
  const initial = (): AdQuery => ({ from: today(), to: today(), pageSize: 20 })
  const [draft, setDraft] = useState<AdQuery>(initial)
  const [query, setQuery] = useState<AdQuery>(initial)
  const [data, setData] = useState<AdAnalytics | null>(null)
  const [selected, setSelected] = useState<AdItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [cursors, setCursors] = useState<string[]>([''])
  const invalid = !draft.from || !draft.to || draft.from > draft.to || draft.to > today() || draft.from < new Date(Date.now() - 89 * 86400000).toISOString().slice(0, 10)
  useEffect(() => {
    let active = true
    setData(null); setFailure('')
    if (!applicationId) { setLoading(false); return () => { active = false } }
    setLoading(true)
    void api.adAnalytics(query, applicationId).then(result => { if (active) setData(result) }).catch(error => {
      const message = reportOperationFailure('加载广告统计失败', error)
      if (active) { setFailure(message); notify(message, 'error') }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, applicationId, query, refresh, notify])
  const reset = (next: AdQuery) => { setCursors(['']); setQuery({ ...next, cursor: undefined }); setSelected(null) }
  const status = (item: AdItem) => item.completed ? '激励完播' : item.failed ? item.shown ? '展示后失败' : '未展示失败' : item.skipped ? '本地拦截' : item.cancelled ? item.shown ? '已展示，未完播' : '取消，未确认展示' : item.closed ? item.shown ? '展示已结束' : '关闭，未确认展示' : item.shown ? '已确认展示' : item.unknown ? '结果未知' : '等待结果'
  const cards: { key: keyof AdSummary; label: string }[] = [
    { key: 'requests', label: '展示请求' }, { key: 'shown', label: '客户端确认展示' }, { key: 'failedBeforeShow', label: '展示前失败' }, { key: 'unknown', label: '展示结果未知' },
    { key: 'completed', label: '激励完播' }, { key: 'failedAfterShow', label: '展示后失败' },
  ]
  const otherCards: typeof cards = [
    { key: 'calls', label: '广告调用' }, { key: 'createFailures', label: '创建 / 准备失败' },
    { key: 'closeUnknown', label: '关闭结果未知' }, { key: 'pending', label: '等待展示结果' }, { key: 'skipped', label: '本地拦截' }, { key: 'cancelled', label: '激励未完播 / 取消' },
  ]
  const columns: TableProps<AdItem>['columns'] = [
    { title: '调用时间（UTC）', dataIndex: 'occurredAt', width: 200, render: utc },
    { title: '广告类型', dataIndex: 'adType', width: 100, render: v => v === 'rewarded' ? '激励' : '插屏' },
    { title: '广告位', dataIndex: 'adUnitId', width: 160, ellipsis: true },
    { title: '入口', dataIndex: 'scene', width: 120, render: v => scenes[v] || v },
    { title: '结果', width: 180, render: (_, row) => <><Tag color={row.failed ? 'error' : row.completed || row.shown ? 'success' : row.unknown ? 'warning' : 'default'}>{status(row)}</Tag>{row.unknown === 1 && (row.shown === 1 || row.closed === 1 || row.failed === 1) && <Tag>曾超时</Tag>}</> },
    { title: '构建', dataIndex: 'clientVersion', width: 140, ellipsis: true },
    { title: '调用 ID', dataIndex: 'eventId', width: 220, ellipsis: true },
    { title: '操作', fixed: 'right', width: 100, render: (_, row) => <Button size="small" onClick={() => setSelected(row)}>查看明细</Button> },
  ]
  const textFilter = (key: 'adUnitId' | 'clientVersion' | 'errorCode' | 'tiktokVersion', label: string, maxLength: number) => <Flex vertical gap={4}><label htmlFor={`ad-${key}`}>{label}</label><Input id={`ad-${key}`} style={{ width: 160 }} placeholder="精确匹配" maxLength={maxLength} value={draft[key] || ''} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value.trim() || undefined }))} /></Flex>
  const selectFilter = (key: 'adType' | 'scene' | 'os', label: string, options: Record<string, string>) => <Flex vertical gap={4}><label htmlFor={`ad-${key}`}>{label}</label><Select id={`ad-${key}`} aria-label={label} style={{ width: 140 }} allowClear placeholder="全部" value={draft[key]} options={Object.entries(options).map(([value, text]) => ({ value, label: text }))} onChange={value => setDraft(current => ({ ...current, [key]: value }))} /></Flex>
  return <section aria-labelledby="ad-analytics-title" aria-busy={loading}><PageStack>
    <PageHeader title="广告统计" id="ad-analytics-title" eyebrow={`${applicationName || applicationId || '当前应用'} · 客户端广告调用诊断`} actions={<Button icon={<RefreshCw size={16} />} disabled={!applicationId} loading={loading} onClick={() => { reset(query); setRefresh(value => value + 1) }}>刷新</Button>} />
    <Flex gap={12} wrap align="end">
      <ReportDateRangePicker id="ad-date" from={draft.from} to={draft.to} onChange={(from, to) => setDraft(current => ({ ...current, from, to }))} />
      {selectFilter('adType', '广告类型', { rewarded: '激励', interstitial: '插屏' })}{selectFilter('scene', '入口', scenes)}
      {textFilter('adUnitId', '广告位', 128)}{textFilter('clientVersion', '构建版本', 64)}{textFilter('errorCode', '错误码', 12)}
      {selectFilter('os', '系统', { ios: 'iOS', android: 'Android', unknown: '未知' })}{textFilter('tiktokVersion', 'TikTok 版本', 32)}
      <Button type="primary" disabled={!applicationId || invalid} onClick={() => reset(draft)}>查询</Button><Button onClick={() => { const next = initial(); setDraft(next); reset(next) }}>重置</Button>
    </Flex>
    {invalid && <Typography.Text type="danger">请选择最近 90 天内的完整 UTC 日期范围。</Typography.Text>}
    <Typography.Text type="secondary">按创建、注册回调、直接展示流程统计。请求指实际调用 show，展示指 SDK 确认；不等于 TikTok 平台请求、计费曝光或收入。超时不计失败，迟到结果更新原调用。</Typography.Text>
    <Typography.Text type="secondary">对比调整前后的数据，请按 Mini 构建版本分别查询。旧流程的请求分母不包含加载失败，show 耗时也不包含前置加载时间。</Typography.Text>
    {failure && <Alert type="error" showIcon title={failure} action={<Button onClick={() => setRefresh(value => value + 1)}>重试</Button>} />}
    {!applicationId ? <Empty description="请先选择应用" /> : data && <>
      <Typography.Text type="secondary">请求归属：{query.from} 至 {query.to}（UTC）· 查询时间：{utc(data.generatedAt)}</Typography.Text>
      <Row gutter={[12, 12]}>{cards.map(card => <Col xs={12} md={8} xl={4} key={card.key}><Card size="small"><Statistic title={card.label} value={data.summary[card.key] ?? '—'} /></Card></Col>)}</Row>
      <Row gutter={[12, 12]}><Col xs={24} md={8}><Card size="small"><Statistic title="请求到展示率" value={data.summary.requests ? `${((data.summary.matchedShown / data.summary.requests) * 100).toFixed(2)}%` : '—'} /><Typography.Text type="secondary">同一调用已关联展示 / 展示请求</Typography.Text></Card></Col><Col xs={12} md={8}><Card size="small"><Statistic title="展示耗时 P50" value={ms(data.summary.p50Ms)} /></Card></Col><Col xs={12} md={8}><Card size="small"><Statistic title="展示耗时 P95" value={ms(data.summary.p95Ms)} /></Card></Col></Row>
      <Typography.Text type="secondary">耗时样本 {data.summary.timingSamples} 次：仅取 show 成功回调；未确认及完播补证不计入。</Typography.Text>
      <Collapse items={[{ key: 'other', label: '其他调用结果', children: <Row gutter={[12, 12]}>{otherCards.map(card => <Col xs={12} md={8} xl={4} key={card.key}><Card size="small"><Statistic title={card.label} value={data.summary[card.key] ?? '—'} /></Card></Col>)}</Row> }]} />
      <Card size="small" title="每日漏斗"><Table size="small" rowKey="date" pagination={false} scroll={{ x: 900 }} dataSource={data.daily} columns={[{ title: '请求日期（UTC）', dataIndex: 'date', width: 160 }, { title: '展示请求', dataIndex: 'requests' }, { title: '确认展示', dataIndex: 'shown' }, { title: '展示前失败', dataIndex: 'failedBeforeShow' }, { title: '结果未知', dataIndex: 'unknown' }, { title: '激励完播', dataIndex: 'completed' }]} locale={{ emptyText: '暂无新版客户端采集数据' }} /></Card>
      <Card size="small" title="错误与取消分布"><Table size="small" pagination={false} rowKey={row => `${row.stage}:${row.errorCode}:${row.subErrorCode}:${row.reason}`} dataSource={data.errors} scroll={{ x: 700 }} columns={[{ title: '阶段', dataIndex: 'stage', render: value => stages[value] || value }, { title: '错误码', dataIndex: 'errorCode', render: value => value || '—' }, { title: '子码', dataIndex: 'subErrorCode', render: value => value || '—' }, { title: '分类', dataIndex: 'reason', render: value => reasons[value] || value || '—' }, { title: '次数', dataIndex: 'count' }]} /><Typography.Text type="secondary">11006 合并 104111006 / 11006 与 11006 / 11006，明细保留原始码；输入任一主码查询整个冲突类别。50008 仅合并明确子码或内部码，输入 50008 可查询整个容器不可用类别；通用主码 101150000 不直接归为 50008。30001 在创建阶段与展示阶段含义不同；来源不明的 onError 保留为 SDK 错误回调，不猜测库存或取消原因。</Typography.Text></Card>
    </>}
    <Card size="small" title="广告调用明细"><Table size="small" rowKey={row => `${row.userId}:${row.eventId}`} columns={columns} dataSource={data?.items || []} loading={loading} pagination={false} scroll={{ x: 1300 }} locale={{ emptyText: failure ? '加载失败，请重试' : '暂无调用明细' }} /><Flex justify="end" align="center" gap={12} wrap style={{ marginTop: 16 }}><Typography.Text role="status">第 {cursors.length} 页 · 本页 {data?.items.length || 0} 条</Typography.Text><Button disabled={loading || cursors.length === 1} onClick={() => { const previous = cursors.slice(0, -1); setCursors(previous); setQuery(current => ({ ...current, cursor: previous.at(-1) || undefined })) }}>上一页</Button><Button disabled={loading || !data?.hasMore} onClick={() => { if (data?.nextCursor) { setCursors(current => [...current, data.nextCursor]); setQuery(current => ({ ...current, cursor: data.nextCursor })) } }}>下一页</Button></Flex></Card>
    <Drawer title="广告调用明细" open={!!selected} onClose={() => setSelected(null)} styles={{ wrapper: { width: 'min(900px, 100vw)' }, body: { overflowWrap: 'anywhere' } }}>{selected && <>
      <Descriptions column={1} size="small" items={[{ key: 'id', label: '调用 ID', children: selected.eventId }, { key: 'user', label: '内部用户 ID', children: selected.userId }, { key: 'time', label: '请求时间', children: utc(selected.occurredAt) }, { key: 'slot', label: '广告位', children: selected.adUnitId }, { key: 'scene', label: '入口', children: scenes[selected.scene] }, { key: 'version', label: 'Mini 构建', children: selected.clientVersion }, { key: 'status', label: '当前结果', children: status(selected) }]} />
      <Table size="small" pagination={false} rowKey="kind" scroll={{ x: 920 }} dataSource={selected.events} columns={[{ title: '事实', dataIndex: 'kind', render: value => phases[value] || value }, { title: '阶段', dataIndex: 'stage', render: value => stages[value] || value }, { title: '分类', dataIndex: 'reason', render: value => reasons[value] || value || '—' }, { title: '主码 / 子码 / 内部码', render: (_, row) => `${row.errorCode || '—'} / ${row.subErrorCode || '—'} / ${row.innerErrorCode || '—'}` }, { title: '调用耗时', dataIndex: 'elapsedMs', render: ms }, { title: 'show 耗时', dataIndex: 'showElapsedMs', render: ms }, { title: '展示依据', dataIndex: 'evidence', render: value => value === 'show_promise' ? 'SDK 展示成功' : value === 'completed_close' ? '激励完播补证' : '—' }, { title: '接收时间', dataIndex: 'receivedAt', render: utc }]} />
      <Typography.Paragraph type="secondary">失败诊断仅写日志服务，不保存在统计库。使用当前应用、内部用户 ID 与调用 ID 查询日志中的 client ad failed。</Typography.Paragraph>
      <Typography.Paragraph type="secondary">普通关闭不能证明展示；展示后错误不抹去展示事实。没有原生结果的超时只记未知，不自动重拉广告。</Typography.Paragraph>
    </>}</Drawer>
  </PageStack></section>
}
