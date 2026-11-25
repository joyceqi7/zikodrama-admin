import { useEffect, useState } from 'react'
import { Alert, Button, Card, Drawer, Flex, Input, Select, Table, Tag, Tooltip, Typography, type TableProps } from 'antd'
import type { OperationsApi } from '../../api'
import type { Application } from '../../applications'
import type { CampaignReportQuery, CampaignReportRow, CampaignReportPage as ReportData } from '../../campaignReport'
import { PageHeader, PageStack } from '../../components/PageHeader'
import { ReportAdShowSummary, ReportSummary, ReportTrend } from './ReportContribution'
import { ReportDateRangePicker } from './ReportDateRangePicker'
import { reportOperationFailure } from '../../operationErrors'
import { toUserMessage } from '../../userMessage'

const utcDate = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
const label = (text: string, note: string) => <Tooltip title={note}>{text}</Tooltip>

/** CampaignReportPage 展示三个核心指标，同剧不同链接分别统计，默认查询当前主体全部小程序。 */
export function CampaignReportPage({ api, applications }: {
  /** 当前管理员已认证的报表接口。 */
  api: OperationsApi
  /** 已加载的小程序身份，缺少选项仍可查询当前主体全部小程序。 */
  applications: Application[]
}) {
  const [app, setApp] = useState('')
  const [from, setFrom] = useState(() => utcDate())
  const [to, setTo] = useState(() => utcDate())
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState<CampaignReportQuery>(() => ({ applicationId: '', range: 'range', from: utcDate(), to: utcDate(), query: '', page: 1, pageSize: 20, sort: 'rewardCompletions', direction: 'desc' }))
  const [data, setData] = useState<ReportData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)
  const [detail, setDetail] = useState<CampaignReportRow | null>(null)
  const invalid = !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || from > to || to > utcDate() || Date.parse(to) - Date.parse(from) >= 90 * 86400000
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setData(null); setDetail(null)
    void api.campaignReport(query).then(next => { if (active) setData(next) }).catch(cause => {
      reportOperationFailure('加载投放链接奖励贡献报表失败', cause)
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
  const columns: TableProps<CampaignReportRow>['columns'] = [
    { title: '小程序', dataIndex: 'applicationName', width: 150 },
    { title: '投放名称／编码', width: 230, render: (_, row) => <Flex vertical><Typography.Text strong>{row.name}</Typography.Text><Typography.Text type="secondary">{row.code}</Typography.Text>{row.status !== 'active' && <Tag>已停用</Tag>}</Flex> },
    { title: '落地剧', dataIndex: 'dramaTitle', width: 180 },
    { title: label('奖励领取人数', '成功领取逐集或 VIP 广告奖励的用户，按应用和用户标识去重'), key: 'rewardUsers', dataIndex: 'rewardUsers', width: 160, sorter: true, sortOrder: query.sort === 'rewardUsers' ? query.direction === 'desc' ? 'descend' : 'ascend' : null, render: (value: number) => value.toLocaleString() },
    { title: label('奖励结算次数', '逐集与 VIP 广告进度奖励成功结算之和，重试不重复计数'), key: 'rewardCompletions', width: 210, sorter: true, sortOrder: query.sort === 'rewardCompletions' ? query.direction === 'desc' ? 'descend' : 'ascend' : null, render: (_, row) => <Flex vertical><Typography.Text strong>{row.rewardCompletions.toLocaleString()}</Typography.Text><Typography.Text type="secondary">解锁 {row.episodeRewards.toLocaleString()} ／ VIP 广告 {row.vipRewards.toLocaleString()}</Typography.Text></Flex> },
    { title: label('人均奖励次数', '结算次数 ÷ 领取人数，结合人数判断，避免小样本误判'), key: 'averageRewards', dataIndex: 'averageRewards', width: 180, sorter: true, sortOrder: query.sort === 'averageRewards' ? query.direction === 'desc' ? 'descend' : 'ascend' : null, render: (value: number | null) => value == null ? '—' : value.toFixed(2) },
    { title: '操作', width: 100, render: (_, row) => <Button type="link" aria-label={`查看 ${row.name} 贡献明细`} onClick={() => setDetail(row)}>贡献明细</Button> },
    { title: '投放链接', width: 100, render: (_, row) => row.landingUrl ? <Typography.Link href={row.landingUrl} target="_blank" rel="noopener noreferrer">查看链接</Typography.Link> : '—' },
  ]
  const change: TableProps<CampaignReportRow>['onChange'] = (pagination, _filters, sorter, extra) => {
    if (extra.action === 'sort' && !Array.isArray(sorter)) {
      const sort = !sorter.order ? 'rewardCompletions' : sorter.columnKey === 'averageRewards' ? 'averageRewards' : sorter.columnKey === 'rewardUsers' ? 'rewardUsers' : 'rewardCompletions'
      setQuery(current => ({ ...current, page: 1, sort, direction: sorter.order === 'ascend' ? 'asc' : 'desc' }))
    } else if (extra.action === 'paginate') {
      setQuery(current => ({ ...current, page: pagination.pageSize === current.pageSize ? pagination.current ?? 1 : 1, pageSize: pagination.pageSize ?? current.pageSize }))
    }
  }
  const scope = query.applicationId ? applications.find(item => item.id === query.applicationId)?.name || query.applicationId : '当前主体全部小程序'
  return <section aria-labelledby="campaign-report-title"><PageStack>
    <PageHeader id="campaign-report-title" title="投放链接奖励贡献" eyebrow="比较各链接带来的成功广告奖励贡献" actions={<Button aria-label="刷新" loading={loading} disabled={loading} onClick={() => setRevision(value => value + 1)}>刷新</Button>} />
    <Card size="small"><Flex wrap gap={12} align="end">
      <Flex vertical gap={4}><Typography.Text>小程序</Typography.Text><Select aria-label="报表小程序" value={app} style={{ minWidth: 180 }} options={[{ value: '', label: '当前主体全部小程序' }, ...applications.map(item => ({ value: item.id, label: item.name }))]} onChange={value => { setApp(value); setQuery(current => ({ ...current, applicationId: value, page: 1 })) }} /></Flex>
      <ReportDateRangePicker id="campaign-report" from={from} to={to} onChange={(nextFrom, nextTo) => { setFrom(nextFrom); setTo(nextTo) }} />
      <Input aria-label="搜索投放链接" placeholder="投放名称或编码" style={{ width: 220, maxWidth: '100%' }} maxLength={100} value={search} onChange={event => setSearch(event.target.value)} onPressEnter={submit} />
      <Button type="primary" disabled={invalid} onClick={submit}>查询</Button>
      <Flex wrap gap={8}><Button onClick={() => preset(1)}>今日</Button><Button onClick={() => preset(1, -1)}>昨日</Button><Button onClick={() => preset(7)}>近 7 天</Button><Button onClick={() => preset(30)}>近 30 天</Button></Flex>
    </Flex></Card>
    {invalid && <Alert type="warning" title="请选择有效 UTC 日期，结束不晚于今天，最多查询 90 天。" />}
    <Typography.Text type="secondary">按本次启动链接归因，包含剧集解锁和 VIP 广告进度奖励，重试不重复计数。</Typography.Text>
    {data?.adShows && <ReportAdShowSummary shows={data.adShows} />}
    {data?.summary && <><ReportSummary summary={data.summary} countLabel="广告奖励结算总次数" /><Typography.Text type="secondary">剧集解锁 {data.summary.episodeRewards.toLocaleString()} 次 · VIP 广告完成 {data.summary.vipRewards.toLocaleString()} 次</Typography.Text></>}
    {data?.unattributed && <Card size="small" title="未归因奖励"><Typography.Text>结算 {data.unattributed.rewardCompletions.toLocaleString()} 次 · 参与 {data.unattributed.rewardUsers.toLocaleString()} 人 · 剧集解锁 {data.unattributed.episodeRewards.toLocaleString()} 次 · VIP 广告完成 {data.unattributed.vipRewards.toLocaleString()} 次</Typography.Text><Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>同小程序及日期范围内没有有效投放链接归因的奖励，不受链接名称搜索影响。</Typography.Paragraph></Card>}

    <Typography.Text type="secondary">{scope} · {query.from} 至 {query.to}（UTC）· {query.sort === 'averageRewards' ? '人均奖励次数' : query.sort === 'rewardUsers' ? '奖励领取人数' : '奖励结算次数'}{query.direction === 'desc' ? '降序' : '升序'}</Typography.Text>
    {error ? <Alert type="error" title={error} showIcon action={<Button onClick={() => setRevision(value => value + 1)}>重试</Button>} /> : <Table rowKey="campaignId" size="small" columns={columns} dataSource={data?.items ?? []} loading={loading} scroll={{ x: 1310 }} onChange={change} pagination={{ current: query.page, pageSize: query.pageSize, total: data?.total ?? 0, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: total => `共 ${total} 条链接` }} locale={{ emptyText: '没有匹配的投放链接，请调整筛选条件' }} />}
    <Typography.Text type="secondary">同一人在不同小程序可能分别计数，不同链接的人数不可相加作为总人数。无奖励记录显示 0 次、0 人、人均 —。用户换剧后的奖励仍可能归属原链接；VIP 奖励次数不等于 VIP 权益激活次数。</Typography.Text>
    {detail && <Drawer open size={720} title={`${detail.name} · 贡献明细`} onClose={() => setDetail(null)}><Typography.Paragraph type="secondary">{detail.applicationName} · {detail.code} · {query.from} 至 {query.to}（UTC）</Typography.Paragraph><Flex wrap gap={16}><Card size="small" title="剧集解锁奖励">{detail.episodeRewards.toLocaleString()} 次</Card><Card size="small" title="VIP 广告完成">{detail.vipRewards.toLocaleString()} 次</Card></Flex><ReportTrend key={`${detail.campaignId}:${revision}`} api={api} dimension="campaign" targetId={detail.campaignId} query={query} /></Drawer>}
  </PageStack></section>
}
