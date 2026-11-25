import { ReportDateRangePicker } from './ReportDateRangePicker'
import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Empty, Flex, Select, Segmented, Spin, Table, Typography } from 'antd'
import type { Application } from '../../applications'
import type { OperationsApi } from '../../api'
import type { EpisodeRewardRow, RewardAnalysis, RewardCounts, RewardReportQuery, RewardTrend } from '../../rewardAnalysis'
import { PageHeader, PageStack } from '../../components/PageHeader'
import { reportOperationFailure } from '../../operationErrors'
import { toUserMessage } from '../../userMessage'

const utcDate = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
const average = (row: RewardCounts) => row.rewardUsers ? (row.rewardCompletions / row.rewardUsers).toFixed(2) : '—'
const countsColumns = [
 { title: '结算次数', dataIndex: 'rewardCompletions', width: 130, render: (value: number) => value.toLocaleString() },
 { title: '领取人数', dataIndex: 'rewardUsers', width: 120, render: (value: number) => value.toLocaleString() },
 { title: '人均结算次数', width: 140, render: (_value: unknown, row: RewardCounts) => average(row) },
]

/** RewardAnalysisPage 只读奖励账本，默认跨所有小程序合并共享剧贡献。 */
export function RewardAnalysisPage({ api, applications }: {
 /** api 提供经过认证的奖励报表端口。 */
 api: OperationsApi
 /** applications 为已授权读取的单应用筛选选项。 */
 applications: Application[]
}) {
 const [app, setApp] = useState('')
 const [history, setHistory] = useState<'all' | 'range'>('range')
 const [from, setFrom] = useState(() => utcDate())
 const [to, setTo] = useState(() => utcDate())
 const [query, setQuery] = useState<RewardReportQuery>(() => ({ applicationId: '', range: 'range', from: utcDate(), to: utcDate() }))
 const [data, setData] = useState<RewardAnalysis | null>(null)
 const [error, setError] = useState('')
 const [loading, setLoading] = useState(false)
 const [refresh, setRefresh] = useState(0)
 const [dimension, setDimension] = useState<'drama' | 'campaign'>('drama')
 const [target, setTarget] = useState('')
 const [expanded, setExpanded] = useState<React.Key[]>([])
 const invalid = !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || from > to || to > utcDate() || Date.parse(to) - Date.parse(from) >= 90 * 86400000
 useEffect(() => {
  let active = true
  setData(null); setError(''); setLoading(true); setExpanded([]); setTarget('')
  void api.rewardAnalysis(query).then(next => { if (active) setData(next) }).catch(reason => {
   reportOperationFailure('加载广告奖励分析失败', reason)
   if (active) setError(toUserMessage(reason, '广告奖励分析加载失败，请重试'))
  }).finally(() => { if (active) setLoading(false) })
  return () => { active = false }
 }, [api, query, refresh])
 const options = dimension === 'drama' ? data?.dramas.map(row => ({ value: row.dramaId, label: row.title })) ?? [] : data?.campaigns.map(row => ({ value: row.campaignId, label: `${row.applicationName} · ${row.name} / ${row.code}` })) ?? []
 const selectedTarget = options.some(row => row.value === target) ? target : options[0]?.value ?? ''
 const appName = query.applicationId ? applications.find(row => row.id === query.applicationId)?.name ?? query.applicationId : '所有小程序'
 const submit = () => setQuery({ applicationId: app, range: history, from, to })
 return <section aria-labelledby="reward-analysis-title"><PageStack>
  <PageHeader id="reward-analysis-title" title="运营数据 · 广告奖励分析" eyebrow="只分析当前系统已记录的奖励结算，不涉及投放成本或收入" actions={<Button aria-label="刷新" loading={loading} onClick={() => setRefresh(value => value + 1)}>刷新</Button>} />
  <Card size="small"><Flex wrap gap={12} align="end">
   <Flex vertical gap={4}><Typography.Text>小程序范围</Typography.Text><Select style={{ minWidth: 200 }} aria-label="奖励分析小程序范围" value={app} onChange={value => { setApp(value); setQuery(current => ({ ...current, applicationId: value })) }} options={[{ value: '', label: '所有小程序' }, ...applications.map(row => ({ value: row.id, label: row.name }))]} /></Flex>
   <Flex vertical gap={4}><Typography.Text>排行范围</Typography.Text><Segmented<'all' | 'range'> aria-label="排行范围" value={history} onChange={value => { setHistory(value); setQuery(current => ({ ...current, range: value })) }} options={[{ value: 'all', label: '全部历史' }, { value: 'range', label: '所选日期' }]} /></Flex>
        <ReportDateRangePicker id="reward" from={from} to={to} onChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo) }} />
   <Button type="primary" disabled={invalid} onClick={submit}>查询</Button>
   <Button onClick={() => { const next = { ...query, from: utcDate(-6), to: utcDate() }; setFrom(next.from); setTo(next.to); setQuery(next) }}>近 7 天</Button>
  </Flex><Typography.Paragraph style={{ marginTop: 12, marginBottom: 0 }} type="secondary">当前范围：{appName} · {query.range === 'all' ? '全部历史' : `${query.from} 至 ${query.to}（UTC）`}。排行按结算次数降序展示前 50 名。</Typography.Paragraph></Card>
  {invalid && <Alert type="warning" title="请选择有效日期，结束不晚于今天，日期范围最多 90 天。全部历史仅适用于排行和分集明细。" />}
  {error ? <Alert type="error" showIcon title={error} action={<Button onClick={() => setRefresh(value => value + 1)}>重试</Button>} /> : loading || !data ? <div role="status"><Spin /> 正在加载广告奖励分析…</div> : <>
   <Card title="剧目奖励贡献榜" data-ui="drama-reward-ranking">
    <Typography.Paragraph type="secondary">相同剧在所选小程序的逐集奖励合并统计，每部剧只展示一行。剧目榜按奖励实际发生的剧归属。</Typography.Paragraph>
    <Table size="small" rowKey="dramaId" dataSource={data.dramas} scroll={{ x: 720 }} pagination={{ pageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: '统计范围内暂无逐集广告奖励' }} columns={[
     { title: '排名', width: 70, render: (_value, row) => data.dramas.findIndex(item => item.dramaId === row.dramaId) + 1 },
     { title: '剧名', dataIndex: 'title', width: 240 }, ...countsColumns, Table.EXPAND_COLUMN,
    ]} expandable={{ columnTitle: '操作', columnWidth: 100, expandedRowKeys: expanded, onExpandedRowsChange: keys => setExpanded([...keys]), expandRowByClick: false, expandIcon: ({ expanded: open, onExpand, record }) => <Button size="small" type="link" onClick={event => onExpand(record, event)}>{open ? '收起明细' : '分集明细'}</Button>, expandedRowRender: row => <EpisodeDetails key={`${row.dramaId}:${JSON.stringify(query)}:${refresh}`} api={api} dramaId={row.dramaId} query={query} /> }} />
    <Alert type="info" title={`无剧归属的 VIP 奖励：${data.unassignedVip.rewardCompletions.toLocaleString()} 次 · ${data.unassignedVip.rewardUsers.toLocaleString()} 人（单独统计，不计入剧目榜）`} />
   </Card>
   <Card title="投放链接奖励贡献榜" data-ui="campaign-reward-contribution">
    <Typography.Paragraph type="secondary">各小程序投放链接分别统计，不因落地剧相同而合并。包含逐集和 VIP 广告进度奖励、已停用链接；自然流量不计入。</Typography.Paragraph>
    <Table size="small" rowKey="campaignId" dataSource={data.campaigns} scroll={{ x: 1200 }} pagination={{ pageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: '统计范围内暂无带投放归因的奖励' }} columns={[
     { title: '排名', width: 70, render: (_value, row) => data.campaigns.findIndex(item => item.campaignId === row.campaignId) + 1 },
     { title: '小程序', dataIndex: 'applicationName', width: 150 },
     { title: '投放名称 / 编码', width: 200, render: (_value, row) => <>{row.name}<br /><Typography.Text type="secondary">{row.code}</Typography.Text></> },
     { title: '落地剧', dataIndex: 'dramaTitle', width: 180 }, ...countsColumns,
     { title: '逐集 / VIP', width: 130, render: (_value, row) => `${row.episodeRewards} / ${row.vipRewards}` },
     { title: '操作', width: 100, render: (_value, row) => row.landingUrl ? <Typography.Link href={row.landingUrl} target="_blank" rel="noopener noreferrer">查看链接</Typography.Link> : '—' },
    ]} />
    <Typography.Text type="secondary">用户换剧后产生的奖励仍可能归属原投放链接；VIP 奖励次数不等于 VIP 权益激活次数。</Typography.Text>
   </Card>
   <Card title="每日奖励趋势" data-ui="reward-trend"><Flex wrap gap={12}>
    <Segmented<'drama' | 'campaign'> aria-label="趋势维度" value={dimension} onChange={value => { setDimension(value); setTarget('') }} options={[{ label: '剧目', value: 'drama' }, { label: '投放链接', value: 'campaign' }]} />
    <Select aria-label="奖励趋势目标" style={{ minWidth: 220, maxWidth: '100%' }} value={selectedTarget || undefined} onChange={setTarget} options={options} placeholder="请选择剧目或链接" />
    <Typography.Text type="secondary">{query.from} 至 {query.to} · UTC</Typography.Text>
   </Flex><Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>按顶部小程序范围汇总；趋势使用所选日期，不受“全部历史”排行范围影响。目标列表为当前排行前 50 名。</Typography.Paragraph>
    {selectedTarget ? <RewardTrendPanel key={`${dimension}:${selectedTarget}:${JSON.stringify(query)}:${refresh}`} api={api} dimension={dimension} targetId={selectedTarget} query={query} /> : <Empty description="暂无可查看趋势的剧目或链接" />}
   </Card>
  </>}
  <Card title="统计口径" size="small"><Typography.Paragraph>1. 结算次数：成功领取广告奖励的次数，同一人多次领取会累计；重试不重复计数。</Typography.Paragraph><Typography.Paragraph>2. 领取人数：统计范围内成功领取奖励的去重用户标识数，同一标识在同一剧或链接只计 1 人。</Typography.Paragraph><Typography.Paragraph>3. 人均结算次数 = 结算次数 ÷ 领取人数。不同剧、链接的人数不可相加作为总人数。</Typography.Paragraph><Typography.Paragraph>4. 所有小程序合并结算次数；领取人数按应用及用户标识去重，同一人在不同小程序使用不同标识时会分别计数。</Typography.Paragraph><Alert type="info" title="这些指标反映奖励贡献，不代表广告展示量、完播量、收入或 ROI。" /></Card>
 </PageStack></section>
}

// EpisodeDetails 只在展开时读取分集；关闭或换范围后忽略迟到响应。
function EpisodeDetails({ api, dramaId, query }: { api: OperationsApi; dramaId: string; query: RewardReportQuery }) {
 const [rows, setRows] = useState<EpisodeRewardRow[] | null>(null)
 const [error, setError] = useState('')
 const [retry, setRetry] = useState(0)
 useEffect(() => {
  let active = true
  setRows(null); setError('')
  void api.rewardEpisodes(dramaId, query).then(next => { if (active) setRows(next) }).catch(reason => {
   reportOperationFailure('加载分集奖励明细失败', reason)
   if (active) setError(toUserMessage(reason, '分集奖励明细加载失败，请重试'))
  })
  return () => { active = false }
 }, [api, dramaId, query, retry])
 return <><Typography.Paragraph type="secondary">分集明细按奖励目标集统计，不等于分集播放量或流失率。历史目标集缺失时显示“未知目标集”。</Typography.Paragraph>{error ? <Alert type="error" title={error} action={<Button onClick={() => setRetry(value => value + 1)}>重试</Button>} /> : rows === null ? <Spin /> : <Table size="small" rowKey="episodeNumber" dataSource={rows} pagination={false} scroll={{ x: 480 }} columns={[{ title: '目标集数', width: 180, render: (_value, row) => row.episodeNumber ? `第 ${row.episodeNumber} 集` : '未知目标集' }, ...countsColumns]} />}</>
}

// RewardTrendPanel 查询范围总人数并独立展示两条趋势，失败不沿用旧结果。
function RewardTrendPanel({ api, dimension, targetId, query }: { api: OperationsApi; dimension: 'drama' | 'campaign'; targetId: string; query: RewardReportQuery }) {
 const [data, setData] = useState<RewardTrend | null>(null)
 const [error, setError] = useState('')
 const [retry, setRetry] = useState(0)
 useEffect(() => {
  let active = true
  setData(null); setError('')
  void api.rewardTrend(dimension, targetId, query).then(next => { if (active) setData(next) }).catch(reason => {
   reportOperationFailure('加载每日奖励趋势失败', reason)
   if (active) setError(toUserMessage(reason, '每日奖励趋势加载失败，请重试'))
  })
  return () => { active = false }
 }, [api, dimension, targetId, query, retry])
 if (error) return <Alert type="error" title={error} action={<Button onClick={() => setRetry(value => value + 1)}>重试</Button>} />
 if (!data) return <Spin />
 return <><Flex wrap gap={16}><div style={{ flex: '1 1 280px', minWidth: 0 }}><RewardLine data={data} metric="rewardCompletions" title="结算次数" color="#7549e8" /></div><div style={{ flex: '1 1 280px', minWidth: 0 }}><RewardLine data={data} metric="rewardUsers" title="领取人数" color="#13b5c9" /></div></Flex><Alert type="info" title={`范围结算次数 ${data.total.rewardCompletions.toLocaleString()} 次 · 范围去重领取人数 ${data.total.rewardUsers.toLocaleString()} 人 · 人均结算次数 ${average(data.total)}`} description="期间领取人数重新去重，不累加每日人数。" /><details><summary>查看每日奖励明细</summary><Table size="small" rowKey="date" dataSource={data.days} pagination={false} scroll={{ x: 530 }} columns={[{ title: '日期（UTC）', dataIndex: 'date', width: 140 }, ...countsColumns]} /></details></>
}

// RewardLine 使用独立纵轴绘制实际奖励信号，单日保留点，长范围显示端点日期。
function RewardLine({ data, metric, title, color }: { data: RewardTrend; metric: keyof RewardCounts; title: string; color: string }) {
 const figure = useRef<HTMLElement>(null)
 const [width, setWidth] = useState(500)
 useEffect(() => { const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setWidth(entry.contentRect.width) }); if (figure.current) observer.observe(figure.current); return () => observer.disconnect() }, [])
 const max = Math.max(1, ...data.days.map(row => row[metric]))
 const x = (i: number) => data.days.length === 1 ? width / 2 : 45 + i * (width - 65) / Math.max(1, data.days.length - 1)
 const y = (value: number) => 160 - value / max * 135
 return <figure ref={figure} style={{ margin: 0 }}><figcaption>{title}</figcaption><svg role="img" aria-label={`${title}每日奖励趋势`} viewBox={`0 0 ${width} 200`}>
  {[0, 0.5, 1].map(ratio => <g key={ratio}><line x1="40" x2={width - 10} y1={y(max * ratio)} y2={y(max * ratio)} stroke="currentColor" opacity="0.12" /><text x="35" y={y(max * ratio) + 4} textAnchor="end" fontSize="12" fill="currentColor">{(max * ratio).toLocaleString('zh-CN', { maximumFractionDigits: 1 })}</text></g>)}
  <polyline points={data.days.map((row, i) => `${x(i)},${y(row[metric])}`).join(' ')} fill="none" stroke={color} strokeWidth="2" />
  {data.days.map((row, i) => <circle key={row.date} cx={x(i)} cy={y(row[metric])} r="3" fill={color} tabIndex={0} aria-label={`${row.date} ${title} ${row[metric]}`}><title>{row.date} · {title}：{row[metric]}</title></circle>)}
  {data.days.filter((_row, i) => i === 0 || i === data.days.length - 1).map(row => <text key={row.date} x={x(data.days.indexOf(row))} y="185" textAnchor="middle" fontSize="12" fill="currentColor">{row.date.slice(5)}</text>)}
 </svg></figure>
}
