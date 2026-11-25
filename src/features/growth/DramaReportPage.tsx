import { useEffect, useState } from 'react'
import { Alert, Button, Card, Drawer, Flex, Input, Select, Table, Tooltip, Typography, type TableProps } from 'antd'
import type { OperationsApi } from '../../api'
import type { Application } from '../../applications'
import type { DramaReportQuery, DramaReportRow, DramaReportPage as ReportData } from '../../dramaReport'
import type { EpisodeRewardRow } from '../../rewardAnalysis'
import { PageHeader, PageStack } from '../../components/PageHeader'
import { ReportAdShowSummary, ReportSummary, ReportTrend } from './ReportContribution'
import { ReportDateRangePicker } from './ReportDateRangePicker'
import { reportOperationFailure } from '../../operationErrors'
import { toUserMessage } from '../../userMessage'

const utcDate = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
const label = (text: string, note: string) => <Tooltip title={note}>{text}</Tooltip>

/** DramaReportPage 展示广告解锁贡献排行与范围汇总，独立于仪表盘且默认合并当前主体全部小程序。 */
export function DramaReportPage({ api, applications }: {
  /** 当前管理员已认证的报表接口。 */
  api: OperationsApi
  /** 已加载的小程序身份，缺少选项仍可查询当前主体全部小程序。 */
  applications: Application[]
}) {
  const [app, setApp] = useState('')
  const [from, setFrom] = useState(() => utcDate())
  const [to, setTo] = useState(() => utcDate())
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState<DramaReportQuery>(() => ({ applicationId: '', range: 'range', from: utcDate(), to: utcDate(), query: '', page: 1, pageSize: 20, sort: 'unlockCount', direction: 'desc' }))
  const [data, setData] = useState<ReportData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)
  const [detail, setDetail] = useState<DramaReportRow | null>(null)
  const invalid = !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || from > to || to > utcDate() || Date.parse(to) - Date.parse(from) >= 90 * 86400000
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setData(null); setDetail(null)
    void api.dramaReport(query).then(next => { if (active) setData(next) }).catch(cause => {
      reportOperationFailure('加载剧目播放与解锁报表失败', cause)
      if (active) setError(toUserMessage(cause, '报表加载失败，请重试'))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, query, revision])
  const submit = () => { if (!invalid) setQuery(current => ({ ...current, applicationId: app, from, to, query: search.trim(), page: 1 })) }
  const preset = (days: number, offset = 0) => {
    const dates = { from: utcDate(offset-days+1), to: utcDate(offset) }
    setFrom(dates.from); setTo(dates.to)
    setQuery(current => ({ ...current, ...dates, applicationId: app, query: search.trim(), page: 1 }))
  }
  const columns: TableProps<DramaReportRow>['columns'] = [
    { title: '短剧', width: 240, render: (_, row) => <Flex vertical><Typography.Text strong>{row.title}</Typography.Text><Typography.Text type="secondary">ID：{row.dramaId}</Typography.Text></Flex> },
    { title: label('广告解锁结算次数', '成功剧集广告奖励结算次数；一次批量解锁多集计一次，重试不重复计数'), key: 'unlockCount', dataIndex: 'unlockCount', width: 190, sorter: true, sortOrder: query.sort === 'unlockCount' ? query.direction === 'desc' ? 'descend' : 'ascend' : null, render: (value: number) => <Typography.Text strong>{value.toLocaleString()}</Typography.Text> },
    { title: label('广告解锁人数', '成功领取逐集广告奖励的去重用户数，不含 VIP、免费及其他方式'), key: 'unlockUsers', dataIndex: 'unlockUsers', width: 170, sorter: true, sortOrder: query.sort === 'unlockUsers' ? query.direction === 'desc' ? 'descend' : 'ascend' : null, render: (value: number) => value.toLocaleString() },
    { title: label('人均广告解锁次数', '逐集奖励成功结算次数 ÷ 领取人数；一次批量解锁多集仍计一次'), key: 'averageUnlocks', dataIndex: 'averageUnlocks', width: 200, sorter: true, sortOrder: query.sort === 'averageUnlocks' ? query.direction === 'desc' ? 'descend' : 'ascend' : null, render: (value: number | null) => value == null ? '—' : value.toFixed(2) },
    { title: '操作', width: 110, render: (_, row) => <Button type="link" aria-label={`查看 ${row.title} 贡献明细`} onClick={() => setDetail(row)}>贡献明细</Button> },
  ]
  const change: TableProps<DramaReportRow>['onChange'] = (pagination, _filters, sorter, extra) => {
    if (extra.action === 'sort' && !Array.isArray(sorter)) {
      const sort = !sorter.order ? 'unlockCount' : sorter.columnKey === 'averageUnlocks' ? 'averageUnlocks' : sorter.columnKey === 'unlockUsers' ? 'unlockUsers' : 'unlockCount'
      setQuery(current => ({ ...current, page: 1, sort, direction: sorter.order === 'ascend' ? 'asc' : 'desc' }))
    } else if (extra.action === 'paginate') {
      setQuery(current => ({ ...current, page: pagination.pageSize === current.pageSize ? pagination.current ?? 1 : 1, pageSize: pagination.pageSize ?? current.pageSize }))
    }
  }
  const scope = query.applicationId ? applications.find(item => item.id === query.applicationId)?.name || query.applicationId : '当前主体全部小程序'
  return <section aria-labelledby="drama-report-title"><PageStack>
    <PageHeader id="drama-report-title" title="剧目广告解锁贡献" eyebrow="按成功广告奖励结算次数比较剧目贡献" actions={<Button aria-label="刷新" loading={loading} disabled={loading} onClick={() => setRevision(value => value + 1)}>刷新</Button>} />
    <Card size="small"><Flex wrap gap={12} align="end">
      <Flex vertical gap={4}><Typography.Text>小程序</Typography.Text><Select aria-label="报表小程序" value={app} style={{ minWidth: 180 }} options={[{ value: '', label: '当前主体全部小程序' }, ...applications.map(item => ({ value: item.id, label: item.name }))]} onChange={value => { setApp(value); setQuery(current => ({ ...current, applicationId: value, page: 1 })) }} /></Flex>
      <ReportDateRangePicker id="drama-report" from={from} to={to} onChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo) }} />
      <Input aria-label="搜索短剧" placeholder="剧名或剧 ID" style={{ width: 220, maxWidth: '100%' }} maxLength={100} value={search} onChange={event => setSearch(event.target.value)} onPressEnter={submit} />
      <Button type="primary" disabled={invalid} onClick={submit}>查询</Button>
      <Flex wrap gap={8}><Button onClick={() => preset(1)}>今日</Button><Button onClick={() => preset(1, -1)}>昨日</Button><Button onClick={() => preset(7)}>近 7 天</Button><Button onClick={() => preset(30)}>近 30 天</Button></Flex>
    </Flex></Card>
    {invalid && <Alert type="warning" title="请选择有效 UTC 日期，结束不晚于今天，最多查询 90 天。" />}
    <Typography.Text type="secondary">仅统计成功剧集广告奖励；一次批量解锁多集计一次，不含 VIP 广告进度奖励。</Typography.Text>
    {data?.adShows && <ReportAdShowSummary shows={data.adShows} />}
    {data?.summary && <ReportSummary summary={data.summary} countLabel="广告解锁结算总次数" />}
    <Typography.Text type="secondary">{scope} · {query.from} 至 {query.to}（UTC）· {query.sort === 'averageUnlocks' ? '人均广告解锁次数' : query.sort === 'unlockUsers' ? '广告解锁人数' : '广告解锁结算次数'}{query.direction === 'desc' ? '降序' : '升序'}</Typography.Text>
    {error ? <Alert type="error" title={error} showIcon action={<Button onClick={() => setRevision(value => value + 1)}>重试</Button>} /> : <Table rowKey="dramaId" size="small" columns={columns} dataSource={data?.items ?? []} loading={loading} scroll={{ x: 810 }} onChange={change} pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total ?? 0, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: total => `共 ${total} 部剧` }} locale={{ emptyText: '没有匹配的短剧，请调整搜索条件' }} />}
    <Typography.Text type="secondary">当前主体全部小程序按应用及用户标识去重，同一人在不同小程序可能分别计数。无解锁记录显示 0 人、人均 —；人数不能跨剧相加，人均指标应结合人数判断。</Typography.Text>
    {detail && <EpisodeReport key={`${detail.dramaId}:${revision}`} api={api} row={detail} query={query} onClose={() => setDetail(null)} />}
  </PageStack></section>
}

// EpisodeReport 按需读取广告奖励目标集，不把批量解锁当作每集实际观看。
function EpisodeReport({ api, row, query, onClose }: { api: OperationsApi; row: DramaReportRow; query: DramaReportQuery; onClose: () => void }) {
  const [rows, setRows] = useState<EpisodeRewardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    void api.dramaReportEpisodes(row.dramaId, query).then(next => { if (active) setRows(next) }).catch(cause => {
      reportOperationFailure('加载剧目报表分集明细失败', cause)
      if (active) setError(toUserMessage(cause, '分集明细加载失败，请重试'))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, row.dramaId, query, revision])
  return <Drawer open size={640} title={`${row.title} · 贡献明细`} onClose={onClose}>
    <ReportTrend api={api} dimension="drama" targetId={row.dramaId} query={query} />
    <Typography.Title level={5}>各集广告解锁贡献</Typography.Title>
    <Typography.Paragraph type="secondary">按触发广告奖励的目标集统计；批量解锁不会在各集重复计数，历史目标集缺失时显示未知。</Typography.Paragraph>
    <Typography.Paragraph type="secondary">{query.from} 至 {query.to} · UTC · 与列表使用相同小程序范围</Typography.Paragraph>
    {error ? <Alert type="error" title={error} action={<Button onClick={() => setRevision(value => value + 1)}>重试</Button>} /> : <Table rowKey="episodeNumber" size="small" pagination={false} loading={loading} dataSource={rows} columns={[
      { title: '奖励目标集', render: (_, item) => item.episodeNumber ? `第 ${item.episodeNumber} 集` : '未知目标集' },
      { title: '解锁结算次数', dataIndex: 'rewardCompletions', render: (value: number) => value.toLocaleString() },
      { title: '广告解锁人数', dataIndex: 'rewardUsers', render: (value: number) => value.toLocaleString() },
    ]} locale={{ emptyText: '所选范围暂无逐集广告解锁记录' }} />}
  </Drawer>
}
