import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { AnalyticsDashboard } from './AnalyticsDashboard'
import type { OperationsApi } from '../../api'
import type { AnalyticsDashboard as Data } from '../../analytics'

const data: Data = { timeZone: 'UTC', generatedAt: '2026-09-15T10:00:00Z', days: [{ date: '2026-09-15', newUsers: 17, rewardCompletions: 9, episodeUnlocks: 27, vipActivations: 2 }] }

test('真实返回值形成卡片与单日趋势，未接入指标不能变成零', async () => {
 const dashboard = vi.fn().mockResolvedValue(data)
 render(<AnalyticsDashboard api={{ dashboard } as unknown as OperationsApi} applicationId="1" />)
 expect((await screen.findAllByText('17')).length).toBeGreaterThan(0)
 expect(dashboard.mock.calls[0]).toEqual([new Date().toISOString().slice(0, 10), new Date().toISOString().slice(0, 10), 'range'])
 expect(screen.getByRole('img', { name: '新增用户每日趋势' })).toBeInTheDocument()
 expect(screen.getByText(/当前服务端未接入行为指标采集/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', { name: /今\s*日/ }))
 await waitFor(() => expect(dashboard).toHaveBeenCalledTimes(2))
 const args = dashboard.mock.calls[1]
 expect(args[0]).toBe(args[1])
 fireEvent.click(screen.getByLabelText('结束日期（UTC）').closest('.ant-picker')!.querySelector('.ant-picker-clear')!)
 expect(screen.getByRole('button', { name: /查\s*询/ })).toBeDisabled()
})

test('切换应用忽略旧响应，失败可重试且不保留旧统计', async () => {
 let resolve!: (value: Data) => void
 const old = new Promise<Data>((done) => { resolve = done })
 const api = { dashboard: vi.fn().mockReturnValueOnce(old).mockResolvedValueOnce(data).mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(data) } as unknown as OperationsApi
 const view = render(<AnalyticsDashboard api={api} applicationId="a" />)
 view.rerender(<AnalyticsDashboard api={api} applicationId="b" />)
 await screen.findAllByText('17')
 await act(async () => resolve({ ...data, days: [{ ...data.days[0], newUsers: 999 }] }))
 expect(screen.queryByText('999', { selector: '.ant-statistic-content-value-int' })).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', { name: '刷新' }))
 await screen.findByRole('alert')
 expect(screen.queryByText('17', { selector: '.ant-statistic-content-value-int' })).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
 expect((await screen.findAllByText('17')).length).toBeGreaterThan(0)
})

test('活跃按末日及30日去重展示，完播率使用汇总分母且零分母显示横线', async () => {
 const dashboard = vi.fn().mockResolvedValue({ ...data, audience: { monthlyActiveUsers: 23, firstReceivedAt: '2026-09-15T00:00:00Z' }, days: [{ ...data.days[0], activeUsers: 10, launches: 20, playStarts: 8, playCompletions: 2, rewardedShows: 0, adCompletions: 0, interstitialShows: 9, tiktokPostbackAttempts: 12, tiktokPostbackSuccesses: 10, tiktokPostbackFailures: 2 }] })
 render(<AnalyticsDashboard api={{ dashboard } as unknown as OperationsApi} applicationId="1" />)
 await screen.findByText('25.0%')
 expect(screen.getByText('MAU（近 30 日）')).toBeInTheDocument()
 expect(screen.getByText('23')).toBeInTheDocument()
 expect(screen.getByText('—')).toBeInTheDocument()
 expect(screen.getByText(/仅统计新版客户端成功上报/)).toBeInTheDocument()
 expect(screen.getByText('TikTok SDK 调用')).toBeInTheDocument()
 expect(screen.getByText('TikTok SDK 已接受')).toBeInTheDocument()
 expect(screen.getByText('TikTok SDK 调用失败')).toBeInTheDocument()
 expect(screen.getByText(/同一事实键/)).toBeInTheDocument()
 const hero = document.querySelector<HTMLElement>('[data-ui="dashboard-hero"]')
 expect(hero).not.toBeNull()
 const interstitial = within(hero!).getByText('插屏广告展示').closest<HTMLElement>('.ant-card')
 const allAds = within(hero!).getByText('广告展示总量').closest<HTMLElement>('.ant-card')
 expect(interstitial).not.toBeNull()
 expect(allAds).not.toBeNull()
 expect(within(interstitial!).getByText('9')).toBeInTheDocument()
 expect(within(allAds!).getByText('9')).toBeInTheDocument()
 expect(within(interstitial!).getByText(/不参与激励完播率/)).toBeInTheDocument()
})


test('历史 MAU 缺少完整窗口时显示未知说明', async () => {
 const dashboard = vi.fn().mockResolvedValue({ ...data, audience: { monthlyActiveUsers: null, firstReceivedAt: '2026-09-15T00:00:00Z' } })
 render(<AnalyticsDashboard api={{ dashboard } as unknown as OperationsApi} applicationId="1" />)
 expect(await screen.findByText('历史窗口不完整，暂无可用快照')).toBeInTheDocument()
 expect(screen.getByText('MAU（近 30 日）')).toBeInTheDocument()
})


test('投放排行统一跟随顶部日期，快捷范围与查询同步更新', async () => {
 const dashboard = vi.fn().mockResolvedValue({ ...data, campaignRanking: [{ campaignId: '901', name: '链接 A', code: 'link_a', landingUrl: 'https://example.test/a', rewardCompletions: 8, rewardUsers: 2 }] })
 render(<AnalyticsDashboard api={{ dashboard } as unknown as OperationsApi} applicationId="101" />)
 await screen.findByText('链接 A')
 expect(dashboard.mock.calls[0][2]).toBe('range')
 const card = document.querySelector<HTMLElement>('[data-ui="campaign-reward-ranking"]')!
 expect(within(card).getByText('8')).toBeInTheDocument()
 expect(within(card).getByText('2')).toBeInTheDocument()
 expect(within(card).getByText(/不代表广告展示量或完播量/)).toBeInTheDocument()
 expect(within(card).getByRole('link', { name: '查看链接' })).toHaveAttribute('href', 'https://example.test/a')
 expect(screen.queryByRole('combobox', { name: '投放排行时间范围' })).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', { name: /今\s*日/ }))
 await waitFor(() => expect(dashboard).toHaveBeenCalledTimes(2))
 const [from, to, rankingRange] = dashboard.mock.calls.at(-1)!
 expect(from).toBe(to)
 expect(rankingRange).toBe('range')
 fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))
 await waitFor(() => expect(dashboard).toHaveBeenCalledTimes(3))
 expect(dashboard.mock.calls.at(-1)).toEqual([from, to, 'range'])
})

test('投放排行无归因奖励时明确显示空状态', async () => {
 render(<AnalyticsDashboard api={{ dashboard: vi.fn().mockResolvedValue({ ...data, campaignRanking: [] }) } as unknown as OperationsApi} applicationId="101" />)
 expect(await screen.findByText('统计范围内暂无带投放归因的广告奖励')).toBeInTheDocument()
})
