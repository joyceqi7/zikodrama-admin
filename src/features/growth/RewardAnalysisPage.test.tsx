import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { RewardAnalysisPage } from './RewardAnalysisPage'
import type { OperationsApi } from '../../api'
import type { Application } from '../../applications'
import type { RewardAnalysis } from '../../rewardAnalysis'

const data: RewardAnalysis = {
 dramas: [{ dramaId: '201', title: '共享测试剧', rewardCompletions: 1200, rewardUsers: 300 }],
 campaigns: [{ campaignId: '9801', applicationId: '101', applicationName: '小程序 A', name: '入口 A', code: 'entry_a', landingUrl: 'https://example.test/a', dramaTitle: '共享测试剧', rewardCompletions: 1000, rewardUsers: 250, episodeRewards: 800, vipRewards: 200 }],
 unassignedVip: { rewardCompletions: 600, rewardUsers: 150 },
}
const applications = [{ id: '101', name: '小程序 A' }, { id: '102', name: '小程序 B' }] as Application[]
function mockApi() {
 return { rewardAnalysis: vi.fn().mockResolvedValue(data), rewardEpisodes: vi.fn().mockResolvedValue([{ episodeNumber: 6, rewardCompletions: 600, rewardUsers: 250 }]), rewardTrend: vi.fn().mockResolvedValue({ days: [{ date: '2026-09-30', rewardCompletions: 20, rewardUsers: 10 }, { date: '2026-10-01', rewardCompletions: 20, rewardUsers: 10 }], total: { rewardCompletions: 40, rewardUsers: 12 } }) }
}

test('默认所有小程序今天，剧目合并、链接保留应用，并用范围独立去重人数', async () => {
 const api = mockApi()
 render(<RewardAnalysisPage api={api as unknown as OperationsApi} applications={applications} />)
 expect(await screen.findByText('入口 A')).toBeInTheDocument()
 expect(api.rewardAnalysis.mock.calls[0][0]).toMatchObject({ applicationId: '', range: 'range', from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) })
 // 趋势与排行独立请求，等待趋势结果，不能用排行先完成推断两个区域都已完成。
 expect(await screen.findByText(/范围去重领取人数 12 人/)).toBeInTheDocument()
 expect(screen.getByText(/无剧归属的 VIP 奖励：600 次 · 150 人/)).toBeInTheDocument()
 expect(screen.getByText(/同一人在不同小程序使用不同标识时会分别计数/)).toBeInTheDocument()
 const linkCard = document.querySelector<HTMLElement>('[data-ui="campaign-reward-contribution"]')!
 expect(within(linkCard).getByText('800 / 200')).toBeInTheDocument()
 expect(within(linkCard).getByRole('link', { name: '查看链接' })).toHaveAttribute('href', 'https://example.test/a')
 fireEvent.click(screen.getByRole('button', { name: '分集明细' }))
 expect(await screen.findByText('第 6 集')).toBeInTheDocument()
 expect(api.rewardEpisodes).toHaveBeenCalledWith('201', expect.objectContaining({ applicationId: '', range: 'range', from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) }))
})

test('单应用和日期筛选使用新范围，趋势可切到投放链接', async () => {
 const api = mockApi()
 render(<RewardAnalysisPage api={api as unknown as OperationsApi} applications={applications} />)
 await screen.findByText('入口 A')
 fireEvent.mouseDown(screen.getByRole('combobox', { name: '奖励分析小程序范围' }))
 fireEvent.click(await screen.findByText('小程序 B'))
 await waitFor(() => expect(api.rewardAnalysis.mock.calls.at(-1)?.[0]).toMatchObject({ applicationId: '102' }))
 fireEvent.click(screen.getByText('全部历史', { exact: true }))
 await waitFor(() => expect(api.rewardAnalysis.mock.calls.at(-1)?.[0]).toMatchObject({ range: 'all' }))
 fireEvent.click(screen.getByText('所选日期', { exact: true }))
 await waitFor(() => expect(api.rewardAnalysis.mock.calls.at(-1)?.[0]).toMatchObject({ applicationId: '102', range: 'range' }))
 fireEvent.click(screen.getByLabelText('开始日期（UTC）'))
 fireEvent.click(screen.getByRole('button', { name: '上个月 (翻页上键)' }))
 fireEvent.click(document.querySelector('td[title="2026-09-29"]')!)
 fireEvent.click(document.querySelector('td[title="2026-09-30"]')!)
 fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))
 await waitFor(() => expect(api.rewardAnalysis.mock.calls.at(-1)?.[0]).toMatchObject({ from: '2026-09-29', to: '2026-09-30' }))
 fireEvent.click(screen.getByText('投放链接', { exact: true }))
 await waitFor(() => expect(api.rewardTrend).toHaveBeenCalledWith('campaign', '9801', expect.objectContaining({ applicationId: '102', from: '2026-09-29' })))
})

test('换范围后忽略旧响应，错误可以重试，空数据不伪造排行', async () => {
 const api = mockApi()
 let resolve!: (data: RewardAnalysis) => void
 api.rewardAnalysis.mockReturnValueOnce(new Promise(done => { resolve = done })).mockResolvedValueOnce({ dramas: [], campaigns: [], unassignedVip: { rewardCompletions: 0, rewardUsers: 0 } }).mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValue(data)
 render(<RewardAnalysisPage api={api as unknown as OperationsApi} applications={applications} />)
 fireEvent.click(screen.getByText('全部历史', { exact: true }))
 await waitFor(() => expect(api.rewardAnalysis.mock.calls.at(-1)?.[0]).toMatchObject({ range: 'all' }))
 await screen.findByText('统计范围内暂无逐集广告奖励')
 await act(async () => resolve(data))
 expect(screen.queryByText('入口 A')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', { name: '刷新' }))
 await screen.findByRole('button', { name: /重\s*试/ })
 fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
 expect(await screen.findByText('入口 A')).toBeInTheDocument()
})

test('分集和趋势故障独立提示，不破坏已加载排行', async () => {
 const api = mockApi()
 api.rewardEpisodes.mockRejectedValueOnce(new Error('episode failure'))
 api.rewardTrend.mockRejectedValueOnce(new Error('trend failure'))
 render(<RewardAnalysisPage api={api as unknown as OperationsApi} applications={applications} />)
 await screen.findByText('入口 A')
 await waitFor(() => expect(screen.getAllByRole('button', { name: /重\s*试/ })).toHaveLength(1))
 fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
 await screen.findByText(/范围去重领取人数 12 人/)
 fireEvent.click(screen.getByRole('button', { name: '分集明细' }))
 await screen.findByRole('button', { name: /重\s*试/ })
 expect(screen.getByText('入口 A')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
 expect(await screen.findByText('第 6 集')).toBeInTheDocument()
})

test('未来日期禁用查询，历史目标集未知时明确显示', async () => {
 const api = mockApi()
 api.rewardEpisodes.mockResolvedValue([{ episodeNumber: 0, rewardCompletions: 5, rewardUsers: 2 }])
 render(<RewardAnalysisPage api={api as unknown as OperationsApi} applications={applications} />)
 await screen.findByText('入口 A')
 fireEvent.click(screen.getByRole('button', { name: '分集明细' }))
 expect(await screen.findByText('未知目标集')).toBeInTheDocument()
 fireEvent.click(screen.getByLabelText('结束日期（UTC）').closest('.ant-picker')!.querySelector('.ant-picker-clear')!)
 expect(screen.getByRole('button', { name: /查\s*询/ })).toBeDisabled()
})
