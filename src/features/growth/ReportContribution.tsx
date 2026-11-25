import { useEffect, useState } from 'react'
import { Alert, Button, Card, Flex, Statistic, Table, Typography } from 'antd'
import type { OperationsApi } from '../../api'
import type { ReportAdShows, RewardReportQuery, RewardReportSummary, RewardTrend } from '../../rewardAnalysis'
import { reportOperationFailure } from '../../operationErrors'
import { toUserMessage } from '../../userMessage'

/** ReportSummary 展示服务端范围去重汇总，不由分页或各行人数计算。 */
export function ReportSummary({ summary, countLabel }: {
  /** 服务端对全部匹配数据独立计算的统计。 */
  summary: RewardReportSummary
  /** 当前页面的成功奖励类型名称。 */
  countLabel: string
}) {
  return <Flex wrap gap={12} aria-label="所选范围贡献汇总">
    <Card size="small" style={{ flex: '2 1 240px' }}><Statistic title={countLabel} value={summary.rewardCompletions} suffix="次" /></Card>
    <Card size="small" style={{ flex: '1 1 180px' }}><Statistic title="奖励参与人数" value={summary.rewardUsers} suffix="人" /></Card>
    <Card size="small" style={{ flex: '1 1 180px' }}><Statistic title="人均结算次数" value={summary.averageRewards ?? '—'} precision={summary.averageRewards == null ? undefined : 2} /></Card>
  </Flex>
}

/** ReportTrend 按所选报表权限读取日期趋势，独立处理加载、重试和过时响应。 */
export function ReportTrend({ api, dimension, targetId, query }: {
  /** 当前管理员认证接口。 */
  api: OperationsApi
  /** 使用剧目或链接报表各自的只读权限。 */
  dimension: 'drama' | 'campaign'
  /** 当前打开的剧目或链接标识。 */
  targetId: string
  /** 与排行一致的日期和应用范围。 */
  query: RewardReportQuery
}) {
  const [data, setData] = useState<RewardTrend | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setData(null)
    const request = dimension === 'drama' ? api.dramaReportTrend(targetId, query) : api.campaignReportTrend(targetId, query)
    void request.then(next => { if (active) setData(next) }).catch(cause => {
      reportOperationFailure('加载报表贡献趋势失败', cause)
      if (active) setError(toUserMessage(cause, '贡献趋势加载失败，请重试'))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, dimension, targetId, query, revision])
  const max = Math.max(1, ...(data?.days.map(day => day.rewardCompletions) ?? []))
  const x = (index: number) => data?.days.length === 1 ? 300 : 45 + index * 535 / Math.max(1, (data?.days.length ?? 1) - 1)
  const y = (value: number) => 155 - value / max * 120
  return <section aria-label="每日奖励贡献" style={{ marginTop: 20 }}>
    <Typography.Title level={5}>每日贡献（UTC）</Typography.Title>
    {error ? <Alert type="error" title={error} action={<Button onClick={() => setRevision(value => value + 1)}>重试</Button>} /> : <>
      {data && <><Typography.Paragraph>范围结算 {data.total.rewardCompletions.toLocaleString()} 次 · 去重参与 {data.total.rewardUsers.toLocaleString()} 人</Typography.Paragraph>
        <svg role="img" aria-label="每日成功广告奖励结算次数趋势" viewBox="0 0 600 195" style={{ width: '100%', display: 'block' }}>
          {[0, 0.5, 1].map(ratio => <g key={ratio}><line x1="40" x2="585" y1={y(max * ratio)} y2={y(max * ratio)} stroke="currentColor" opacity="0.12" /><text x="35" y={y(max * ratio) + 4} textAnchor="end" fontSize="12" fill="currentColor">{(max * ratio).toLocaleString('zh-CN', { maximumFractionDigits: 1 })}</text></g>)}
          <polyline points={data.days.map((day, index) => `${x(index)},${y(day.rewardCompletions)}`).join(' ')} fill="none" stroke="#7549e8" strokeWidth="2" />
          {data.days.map((day, index) => <circle key={day.date} cx={x(index)} cy={y(day.rewardCompletions)} r="3" fill="#7549e8"><title>{day.date}：{day.rewardCompletions} 次</title></circle>)}
          <text x="45" y="185" fontSize="12" fill="currentColor">{data.days[0]?.date}</text><text x="580" y="185" textAnchor="end" fontSize="12" fill="currentColor">{data.days.length > 1 ? data.days.at(-1)?.date : ''}</text>
        </svg><Typography.Paragraph type="secondary">范围人数独立去重，不累加每日人数。</Typography.Paragraph></>}
      <Table size="small" rowKey="date" loading={loading} dataSource={data?.days ?? []} pagination={false} scroll={{ x: 480 }} columns={[
        { title: '日期（UTC）', dataIndex: 'date' },
        { title: '成功结算次数', dataIndex: 'rewardCompletions', render: (value: number) => value.toLocaleString() },
        { title: '当日参与人数', dataIndex: 'rewardUsers', render: (value: number) => value.toLocaleString() },
      ]} locale={{ emptyText: '所选日期暂无奖励贡献' }} />
    </>}
  </section>
}

/** ReportAdShowSummary 展示真实客户端回调统计及应用范围，避免误认为剧目或链接展示贡献。 */
export function ReportAdShowSummary({ shows }: {
 /** 与报表相同应用和日期范围的展示统计。 */
 shows: ReportAdShows
}) {
 return <Card size="small" title="广告展示次数（埋点统计）">
  <Flex wrap gap={24}>
   <Statistic title="总展示次数" value={shows.total} suffix="次" />
   <Statistic title="激励广告展示" value={shows.rewarded} suffix="次" />
   <Statistic title="插屏广告展示" value={shows.interstitial} suffix="次" />
  </Flex>
  <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>统计所选小程序和日期内的展示成功回调；不受剧名或投放链接搜索影响。现有埋点没有剧目及链接归因，展示次数按应用汇总，客户端漏报可能导致少计。</Typography.Paragraph>
  {!shows.complete && <Alert type="warning" title={`部分日期埋点已过期，仅统计 ${shows.availableFrom}（UTC）起的展示记录`} />}
 </Card>
}
