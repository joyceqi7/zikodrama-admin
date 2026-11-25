import { ReportDateRangePicker } from './ReportDateRangePicker'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Alert, Button, Card, Col, Empty, Flex, Row, Select, Spin, Statistic, Table, Typography } from 'antd'
import { RefreshCw } from 'lucide-react'
import type { OperationsApi } from '../../api'
import type { AnalyticsDashboard as DashboardData, DashboardDay } from '../../analytics'
import { PageHeader, PageStack } from '../../components/PageHeader'
import { reportOperationFailure } from '../../operationErrors'
import { toUserMessage } from '../../userMessage'

const metrics = [
  { key: 'newUsers', label: '新增用户', unit: '人', note: '首次建立应用内用户主体' },
  { key: 'rewardCompletions', label: '广告奖励结算', unit: '次', note: '已成功落账的奖励，不代表官方曝光' },
  { key: 'episodeUnlocks', label: '分集权益授予', unit: '集', note: '授予集数，非去重用户数' },
  { key: 'vipActivations', label: 'VIP 权益授予', unit: '次', note: '期间成功授予的 VIP 权益' },
  { key: 'activeUsers', label: '每日活跃用户', unit: '人', note: '成功上报行为的当日去重用户' },
  { key: 'launches', label: '启动次数', unit: '次', note: '成功建立身份的页面启动' },
  { key: 'playStarts', label: '开始播放', unit: '次', note: '不含预加载和暂停恢复' },
  { key: 'playCompletions', label: '剧集完播', unit: '次', note: '按开始播放日期归属' },
  { key: 'rewardedShows', label: '激励广告展示', unit: '次', note: '客户端展示成功回调' },
  { key: 'adCompletions', label: '激励广告完播', unit: '次', note: '完整观看并匹配展示事实' },
  { key: 'interstitialShows', label: '插屏广告展示', unit: '次', note: '不参与激励广告完播率' },
  { key: 'tiktokPostbackAttempts', label: 'TikTok SDK 调用', unit: '次', note: '播放请求、实际播放和广告展示' },
  { key: 'tiktokPostbackSuccesses', label: 'TikTok SDK 已接受', unit: '次', note: '仅 SDK 接受，不证明平台入库或归因' },
  { key: 'tiktokPostbackFailures', label: 'TikTok SDK 调用失败', unit: '次', note: '调用异常或 SDK 拒绝；未知与跳过单列日志' },
] as const
const utcDate = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)

interface DashboardProps {
  // api 提供当前应用的认证统计查询。
  api: OperationsApi
  // applicationId 是当前应用，用于隔离异步请求。
  applicationId: string
  // applicationFilter 复用外壳的应用切换控件。
  applicationFilter?: ReactNode
  // onOpenPostbackLogs 只有独立回传日志权限时才提供。
  onOpenPostbackLogs?: () => void
}

/** AnalyticsDashboard 恢复当前小程序的单页指标概览，沿用原有筛选与趋势。 */
export function AnalyticsDashboard(props: DashboardProps) {
 return <ApplicationDashboard {...props} />
}

// ApplicationDashboard 展示应用级账本与行为趋势，未采集数据不显示为零。
export function ApplicationDashboard({ api, applicationId, applicationFilter, onOpenPostbackLogs }: DashboardProps) {
  const [from, setFrom] = useState(() => utcDate())
  const [to, setTo] = useState(() => utcDate())
  const [range, setRange] = useState({ from, to })
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [metric, setMetric] = useState<(typeof metrics)[number]['key']>('newUsers')
  const invalid = !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to || to > utcDate() || Date.parse(to) - Date.parse(from) >= 90 * 86400000
  useEffect(() => {
    let active = true
    setData(null); setError(''); setLoading(Boolean(applicationId))
    if (!applicationId) return () => { active = false }
    void api.dashboard(range.from, range.to, 'range').then((next) => {
      if (active) setData(next)
    }).catch((reason) => {
      reportOperationFailure('加载仪表盘失败', reason)
      if (active) setError(toUserMessage(reason, '仪表盘加载失败，请重试'))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, applicationId, range, refresh])
  const preset = (days: number, offset = 0) => {
    const next = { from: utcDate(offset - days + 1), to: utcDate(offset) }
    setFrom(next.from); setTo(next.to); setRange(next)
  }
  const availableMetrics = data?.audience ? metrics : metrics.slice(0, 4)
  const selected = metrics.find((item) => item.key === metric)!
  const totals = (key: typeof metric) => data?.days.reduce((sum, day) => sum + (day[key] ?? 0), 0) ?? 0
  return <section aria-labelledby="analytics-dashboard-title">
    <PageStack>
      <PageHeader title="仪表盘" id="analytics-dashboard-title" eyebrow="查看应用用户增长、激励与插屏广告、权益趋势" actions={<Button icon={<RefreshCw size={16} />} disabled={!applicationId} loading={loading} onClick={() => setRefresh((v) => v + 1)}>刷新</Button>} />
      <Flex wrap gap={12} align="end" data-ui="dashboard-filters">
        {applicationFilter}
        <ReportDateRangePicker id="dashboard" from={from} to={to} onChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo) }} />
        <Button type="primary" disabled={invalid || !applicationId} onClick={() => setRange({ from, to })}>查询</Button>
        <Flex wrap gap={8}>{[[1, '今日'], [7, '近 7 天'], [30, '近 30 天']].map(([days, label]) => <Button key={label} onClick={() => preset(Number(days))}>{label}</Button>)}<Button onClick={() => preset(1, -1)}>昨日</Button></Flex>
      </Flex>
      {invalid && <Alert type="warning" title="请选择不晚于今天、开始不晚于结束的日期，最多查询 90 天。" />}
      {!applicationId ? <Empty description="请选择应用后查看仪表盘" /> : error ? <Alert type="error" showIcon title={error} action={<Button onClick={() => setRefresh((v) => v + 1)}>重试</Button>} /> : loading || !data ? <div role="status"><Spin /> 正在加载仪表盘…</div> : <>
        <Typography.Text type="secondary">统计范围：{range.from} 至 {range.to} · UTC · 查询时间：{new Date(data.generatedAt).toLocaleString('zh-CN', { timeZone: 'UTC' })}</Typography.Text>
        {data.audience && <>
          <Typography.Text type="secondary">{data.audience.firstReceivedAt ? `本应用首次采集：${new Date(data.audience.firstReceivedAt).toLocaleString('zh-CN', { timeZone: 'UTC' })} UTC。` : '尚未收到客户端采集信号。'}仅统计新版客户端成功上报的行为，历史无法补齐。</Typography.Text>
          <Row gutter={[12, 12]} data-ui="dashboard-hero">
            {[
              { title: 'DAU', value: data.days.at(-1)?.activeUsers ?? 0, note: `截至 ${range.to} 当日去重用户` },
              { title: 'MAU（近 30 日）', value: data.audience.monthlyActiveUsers ?? '—', note: data.audience.monthlyActiveUsers === null ? '历史窗口不完整，暂无可用快照' : `截至 ${range.to}，不累加每日活跃` },
              { title: '剧集完播率', value: rate(totals('playCompletions'), totals('playStarts')), note: '已完播 / 开始播放；按开始日期归属' },
              { title: '广告展示总量', value: totals('rewardedShows') + totals('interstitialShows'), note: '激励广告与插屏广告展示成功回调之和' },
              { title: '激励广告完播率', value: rate(totals('adCompletions'), totals('rewardedShows')), note: '完整观看 / 激励展示；不含插屏' },
              { title: '插屏广告展示', value: totals('interstitialShows'), note: '客户端确认展示成功；不参与激励完播率' },
            ].map((item) => <Col key={item.title} xs={24} sm={12} xl={8} xxl={4}><Card size="small"><Statistic title={item.title} value={item.value} /><Typography.Text type="secondary">{item.note}</Typography.Text></Card></Col>)}
          </Row>
        </>}

        <Card data-ui="dashboard-trend" title="每日趋势" extra={<Select aria-label="趋势指标" value={metric} onChange={setMetric} options={availableMetrics.map((item) => ({ value: item.key, label: item.label }))} />}>
          <Trend days={data.days} metric={metric} label={selected.label} />
          <details><summary>查看每日明细</summary><Table size="small" rowKey="date" dataSource={data.days} scroll={{ x: data.audience ? 1680 : 690 }} pagination={false} columns={[{ title: '日期（UTC）', dataIndex: 'date', width: 130 }, ...availableMetrics.map((item) => ({ title: `${item.label}（${item.unit}）`, dataIndex: item.key, width: 140 }))]} /></details>
        </Card>
        <Card data-ui="campaign-reward-ranking" title="投放链接广告奖励排行">
          <Typography.Paragraph type="secondary">按当前小程序 {range.from} 至 {range.to}（UTC）范围内的广告奖励结算次数降序排列，展示前 50 名。仅统计成功落账且有投放归因的奖励，包含已停用链接；自然流量不计入。此数据不代表广告展示量或完播量。</Typography.Paragraph>
          {data.campaignRanking === undefined ? <Empty description="当前服务端暂未提供投放排行" /> : <Table size="small" rowKey="campaignId" dataSource={data.campaignRanking} scroll={{ x: 720 }} pagination={{ pageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: '统计范围内暂无带投放归因的广告奖励' }} columns={[
            { title: '排名', width: 70, render: (_value, row) => data.campaignRanking!.findIndex((item) => item.campaignId === row.campaignId) + 1 },
            { title: '投放名称', dataIndex: 'name', width: 200 },
            { title: '投放编码', dataIndex: 'code', width: 180 },
            { title: '奖励结算次数', dataIndex: 'rewardCompletions', width: 130 },
            { title: '领取人数', dataIndex: 'rewardUsers', width: 110 },
            { title: '投放链接', dataIndex: 'landingUrl', width: 100, render: (value: string) => value ? <Typography.Link href={value} target="_blank" rel="noopener noreferrer">查看链接</Typography.Link> : '—' },
          ]} />}
        </Card>
        <Row gutter={[12, 12]} data-ui="dashboard-metrics">{availableMetrics.filter((item) => item.key !== 'activeUsers').map((item) => <Col key={item.key} xs={24} sm={12} xl={4}><Card size="small"><Statistic title={item.label} value={totals(item.key)} suffix={item.unit} /><Typography.Text type="secondary">{item.note}</Typography.Text></Card></Col>)}</Row>
      </>}
      <Card data-ui="dashboard-methodology" size="small" title="统计口径"><Typography.Paragraph>活跃、启动、播放、广告和 TikTok 关键行为回传来自客户端事实记录，不代表 TikTok 官方结算报表。奖励与权益卡片来自业务账本。</Typography.Paragraph><Typography.Text type="secondary">回传阶段使用同一事实键。SDK 已接受仅表示成功回调，不证明 TikTok 入库、归因或计费曝光。新客户端等待 10 秒仍无回调标为结果未知，未调用单列，均不计失败；旧客户端口径保留。暂停恢复不重复计播放开始；播放结束回调计完播，不代表逐秒看完。完播按开始或展示日期归属，迟到回调会更新原日期。分母为零时显示“—”。</Typography.Text>{onOpenPostbackLogs && <Button onClick={onOpenPostbackLogs}>查看回传明细</Button>}{data && !data.audience && <Typography.Paragraph>当前服务端未接入行为指标采集。</Typography.Paragraph>}</Card>
    </PageStack>
  </section>
}

// Trend 为同一口径的每日数据绘制折线；单日保留数据点，键盘聚焦可查看数值。
function Trend({ days, metric, label }: { days: DashboardDay[]; metric: Exclude<keyof DashboardDay, 'date'>; label: string }) {
  const figureRef = useRef<HTMLElement>(null)
  const [width, setWidth] = useState(800)
  useEffect(() => {
    const figure = figureRef.current
    if (!figure) return
    // 侧栏折叠和窗口缩放都会改变容器宽度；保持坐标与文字按实际像素绘制。
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width)
    })
    observer.observe(figure)
    return () => observer.disconnect()
  }, [])
  const [focus, setFocus] = useState<number | null>(null)
  const max = Math.max(1, ...days.map((day) => (day[metric] ?? 0)))
  const x = (i: number) => days.length === 1 ? width / 2 : 50 + i * (width - 80) / (days.length - 1)
  const y = (value: number) => 200 - value * 180 / max
  const selected = focus === null ? undefined : days[focus]
  return <figure ref={figureRef}>
    <figcaption aria-live="polite">{selected ? `${selected.date} · ${label}：${(selected[metric] ?? 0).toLocaleString()}` : '悬停或聚焦数据点查看数值，也可展开每日明细。'}</figcaption>
    <svg viewBox={`0 0 ${width} 240`} role="img" aria-label={`${label}每日趋势`}>
      {[0, 0.5, 1].map((ratio) => <g key={ratio}><line x1="50" x2={width - 30} y1={y(max * ratio)} y2={y(max * ratio)} stroke="currentColor" opacity="0.12" /><text x="40" y={y(max * ratio) + 4} textAnchor="end" fontSize="12" fill="currentColor">{(max * ratio).toLocaleString('zh-CN', { maximumFractionDigits: 1 })}</text></g>)}
      {/* 面积与折线共用真实数值，保持单日和零值可读，不增加新的指标口径。 */}
      {days.length > 1 && <polygon points={`${x(0)},200 ${days.map((day, i) => `${x(i)},${y(day[metric] ?? 0)}`).join(' ')} ${x(days.length - 1)},200`} fill="#7549e8" opacity="0.07" />}
      <polyline points={days.map((day, i) => `${x(i)},${y((day[metric] ?? 0))}`).join(' ')} fill="none" stroke="#7549e8" strokeWidth="3" />
      {days.map((day, i) => <circle key={day.date} cx={x(i)} cy={y((day[metric] ?? 0))} r={focus === i ? 6 : 4} fill="#7549e8" tabIndex={0} aria-label={`${day.date}，${label} ${(day[metric] ?? 0)}`} onFocus={() => setFocus(i)} onBlur={() => setFocus(null)} onMouseEnter={() => setFocus(i)} onMouseLeave={() => setFocus(null)} />)}
      {days.filter((_, i) => i === 0 || i === days.length - 1).map((day) => <text key={day.date} x={x(days.indexOf(day))} y="226" textAnchor="middle" fontSize="12" fill="currentColor">{day.date.slice(5)}</text>)}
    </svg>
  </figure>
}

// rate 以汇总分子分母计算比例；没有分母时不把未知完播率伪装成零。
function rate(completed: number, started: number): string { return started > 0 ? `${(completed / started * 100).toFixed(1)}%` : '—' }
