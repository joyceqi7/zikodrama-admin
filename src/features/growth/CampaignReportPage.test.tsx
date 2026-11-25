import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { OperationsApi } from '../../api'
import type { CampaignReportPage as Data } from '../../campaignReport'
import { CampaignReportPage } from './CampaignReportPage'

const data: Data = { summary: { rewardCompletions: 130, rewardUsers: 25, averageRewards: 5.2, episodeRewards: 100, vipRewards: 30 }, unattributed: { rewardCompletions: 9, rewardUsers: 3, averageRewards: 3, episodeRewards: 4, vipRewards: 5 }, items: [{ campaignId: '215', applicationId: '101', applicationName: '小程序 A', name: '测试投放', code: 'campaign-215', dramaTitle: '共享剧', landingUrl: '', status: 'disabled', rewardUsers: 20, rewardCompletions: 60, episodeRewards: 40, vipRewards: 20, averageRewards: 3 }], total: 1 }
const api = () => ({ campaignReportTrend: vi.fn(async () => ({ total: { rewardCompletions: 60, rewardUsers: 20 }, days: [{ date: '2026-10-05', rewardCompletions: 60, rewardUsers: 20 }] })), campaignReport: vi.fn(async () => data), unused: vi.fn() })

test('默认当前主体全部小程序、今天与结算次数降序，展示拆分和停用链接', async () => {
  const calls = api()
  render(<CampaignReportPage api={calls as unknown as OperationsApi} applications={[]} />)
  expect(await screen.findByText('测试投放')).toBeInTheDocument()
  expect(calls.campaignReport).toHaveBeenCalledWith(expect.objectContaining({ from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10), applicationId: '', range: 'range', sort: 'rewardCompletions', direction: 'desc', page: 1 }))
  expect(screen.getByText('3.00')).toBeInTheDocument()
  expect(screen.getByText('解锁 40 ／ VIP 广告 20')).toBeInTheDocument()
  expect(screen.getByText('已停用')).toBeInTheDocument()
  expect(screen.getByText('130')).toBeInTheDocument()
  expect(screen.getByText('未归因奖励')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '查看 测试投放 贡献明细' }))
  expect(await screen.findByRole('img', { name: '每日成功广告奖励结算次数趋势' })).toBeInTheDocument()
  expect(calls.campaignReportTrend).toHaveBeenCalledWith('215', expect.objectContaining({ applicationId: '' }))
})

test('链接搜索和表头排序由服务器查询，非法日期禁止提交', async () => {
  const calls = api()
  render(<CampaignReportPage api={calls as unknown as OperationsApi} applications={[]} />)
  await screen.findByText('测试投放')
  fireEvent.change(screen.getByRole('textbox', { name: '搜索投放链接' }), { target: { value: ' 215 ' } })
  fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))
  await waitFor(() => expect(calls.campaignReport).toHaveBeenLastCalledWith(expect.objectContaining({ query: '215', page: 1 })))
  await screen.findByText('测试投放')
  fireEvent.click(screen.getByRole('columnheader', { name: /人均奖励次数/ }))
  await waitFor(() => expect(calls.campaignReport).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'averageRewards', page: 1 })))
  fireEvent.click(screen.getByLabelText('结束日期（UTC）').closest('.ant-picker')!.querySelector('.ant-picker-clear')!)
  expect(screen.getByRole('button', { name: /查\s*询/ })).toBeDisabled()
})

test('迟到响应不覆盖新筛选，失败可重试且诊断脱敏', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    let resolve!: (value: Data) => void
    const old = new Promise<Data>(done => { resolve = done })
    const calls = api()
    calls.campaignReport = vi.fn().mockReturnValueOnce(old).mockResolvedValueOnce(data).mockRejectedValueOnce(new Error('token=abc')).mockResolvedValue(data)
    render(<CampaignReportPage api={calls as unknown as OperationsApi} applications={[]} />)
    fireEvent.click(screen.getByRole('button', { name: '近 30 天' }))
    await screen.findByText('测试投放')
    await act(async () => resolve({ ...data, items: [{ ...data.items[0], name: '旧范围剧' }], total: 1 }))
    expect(screen.queryByText('旧范围剧')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '刷新' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    fireEvent.click(await screen.findByRole('button', { name: /重\s*试/ }))
    expect(await screen.findByText('测试投放')).toBeInTheDocument()
    expect(log).toHaveBeenCalledWith('加载投放链接奖励贡献报表失败', { error: 'token=[已脱敏]' })
  } finally { log.mockRestore() }
})


test('人数排序和分页传服务器，零奖励人均显示空值', async () => {
 const calls = { campaignReport: vi.fn(async () => ({ ...data, items: [{ ...data.items[0], rewardUsers: 0, rewardCompletions: 0, episodeRewards: 0, vipRewards: 0, averageRewards: null }], total: 45 })) }
 render(<CampaignReportPage api={calls as unknown as OperationsApi} applications={[]} />)
 await screen.findByText('测试投放')
 expect(screen.getByText('共 45 条链接')).toBeInTheDocument()
 expect(screen.getAllByText('—')).toHaveLength(2)
 fireEvent.click(screen.getByRole('columnheader', { name: /奖励领取人数/ }))
 await waitFor(() => expect(calls.campaignReport).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'rewardUsers', page: 1 })))
 await screen.findByText('测试投放')
 fireEvent.click(screen.getByTitle('2'))
 await waitFor(() => expect(calls.campaignReport).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })))
})
