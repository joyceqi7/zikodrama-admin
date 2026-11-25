import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { OperationsApi } from '../../api'
import type { DramaReportPage as Data } from '../../dramaReport'
import { DramaReportPage } from './DramaReportPage'

const data: Data = { summary: { rewardCompletions: 130, rewardUsers: 25, averageRewards: 5.2, episodeRewards: 100, vipRewards: 30 }, items: [{ dramaId: '215', title: '测试共享剧', playUsers: null, firstEpisodeCompletionRate: null, unlockUsers: 20, unlockCount: 60, averageUnlocks: 3 }], total: 1 }
const api = () => ({ dramaReportTrend: vi.fn(async () => ({ total: { rewardCompletions: 60, rewardUsers: 20 }, days: [{ date: '2026-10-05', rewardCompletions: 60, rewardUsers: 20 }] })), dramaReport: vi.fn(async () => data), dramaReportEpisodes: vi.fn(async () => [{ episodeNumber: 1, rewardUsers: 10, rewardCompletions: 30 }]) })

test('默认按结算次数排序，范围汇总不依赖分页，详情使用报表权限', async () => {
  const calls = api()
  render(<DramaReportPage api={calls as unknown as OperationsApi} applications={[]} />)
  expect(await screen.findByText('测试共享剧')).toBeInTheDocument()
  expect(calls.dramaReport).toHaveBeenCalledWith(expect.objectContaining({ from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10), applicationId: '', range: 'range', sort: 'unlockCount', direction: 'desc', page: 1 }))
  expect(screen.getByText('3.00')).toBeInTheDocument()
  expect(screen.getByText('130')).toBeInTheDocument()
  expect(screen.queryByRole('columnheader', { name: '播放人数' })).not.toBeInTheDocument()
  expect(calls.dramaReportEpisodes).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '查看 测试共享剧 贡献明细' }))
  expect(await screen.findByText('第 1 集')).toBeInTheDocument()
  expect(await screen.findByRole('img', { name: '每日成功广告奖励结算次数趋势' })).toBeInTheDocument()
  expect(calls.dramaReportTrend).toHaveBeenCalledWith('215', expect.objectContaining({ applicationId: '' }))
  expect(calls.dramaReportEpisodes).toHaveBeenCalledWith('215', expect.objectContaining({ applicationId: '', range: 'range' }))
})

test('剧名搜索和表头排序由服务器查询，非法日期禁止提交', async () => {
  const calls = api()
  render(<DramaReportPage api={calls as unknown as OperationsApi} applications={[]} />)
  await screen.findByText('测试共享剧')
  fireEvent.change(screen.getByRole('textbox', { name: '搜索短剧' }), { target: { value: ' 215 ' } })
  fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))
  await waitFor(() => expect(calls.dramaReport).toHaveBeenLastCalledWith(expect.objectContaining({ query: '215', page: 1 })))
  await screen.findByText('测试共享剧')
  fireEvent.click(screen.getByRole('columnheader', { name: /人均广告解锁次数/ }))
  await waitFor(() => expect(calls.dramaReport).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'averageUnlocks', page: 1 })))
  fireEvent.click(screen.getByLabelText('结束日期（UTC）').closest('.ant-picker')!.querySelector('.ant-picker-clear')!)
  expect(screen.getByRole('button', { name: /查\s*询/ })).toBeDisabled()
})

test('迟到响应不覆盖新筛选，失败可重试且诊断脱敏', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    let resolve!: (value: Data) => void
    const old = new Promise<Data>(done => { resolve = done })
    const calls = api()
    calls.dramaReport = vi.fn().mockReturnValueOnce(old).mockResolvedValueOnce(data).mockRejectedValueOnce(new Error('token=abc')).mockResolvedValue(data)
    render(<DramaReportPage api={calls as unknown as OperationsApi} applications={[]} />)
    fireEvent.click(screen.getByRole('button', { name: '近 30 天' }))
    await screen.findByText('测试共享剧')
    await act(async () => resolve({ ...data, items: [{ ...data.items[0], title: '旧范围剧' }], total: 1 }))
    expect(screen.queryByText('旧范围剧')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '刷新' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    fireEvent.click(await screen.findByRole('button', { name: /重\s*试/ }))
    expect(await screen.findByText('测试共享剧')).toBeInTheDocument()
    expect(log).toHaveBeenCalledWith('加载剧目播放与解锁报表失败', { error: 'token=[已脱敏]' })
  } finally { log.mockRestore() }
})
