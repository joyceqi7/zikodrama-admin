import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { OperationsApi } from '../../api'
import type { TikTokPostbackLogPage, TikTokPostbackLogQuery } from '../../postbackLogs'
import { TikTokPostbackLogList } from './TikTokPostbackLogList'

const today = new Date()
const from = new Date(today)
from.setUTCDate(from.getUTCDate() - 6)
const range = { from: from.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) }

const page: TikTokPostbackLogPage = {
  items: [{ userId: '9007199254740993', eventId: 'postback-event-123456', event: 'minis_ad_show', outcome: 'failure', occurredAt: '2026-09-20T01:02:03Z', receivedAt: '2026-09-20T01:02:04Z' }],
  hasMore: true,
  nextCursor: 'next-cursor',
  pageSize: 20,
}

afterEach(() => vi.restoreAllMocks())

test('按事件和状态查询、分页并展示真实脱敏字段', async () => {
  const list = vi.fn(async (_query: TikTokPostbackLogQuery) => page)
  render(<TikTokPostbackLogList api={{ listTikTokPostbackLogs: list } as unknown as OperationsApi} applicationId="101" applicationName="测试小程序" notify={vi.fn()} />)
  expect(await screen.findByText('广告展示')).toBeInTheDocument()
  expect(screen.getByText('调用失败')).toBeInTheDocument()
  expect(screen.getByText('9007199254740993')).toBeInTheDocument()
  expect(screen.getByText('postback-event-123456')).toBeInTheDocument()
  expect(screen.getAllByText(/2026\/9\/20 01:02:0[34] UTC/)).toHaveLength(2)
  fireEvent.mouseDown(screen.getByLabelText('事件类型'))
  fireEvent.click(await screen.findByText('实际播放'))
  fireEvent.mouseDown(screen.getByLabelText('状态'))
  fireEvent.click(await screen.findByText('SDK 已接受'))
  fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))
  await waitFor(() => expect(list).toHaveBeenLastCalledWith({ pageSize: 20, ...range, event: 'ep_play', outcome: 'success' }, '101'))
  fireEvent.click(screen.getByRole('button', { name: '下一页' }))
  await waitFor(() => expect(list).toHaveBeenLastCalledWith({ pageSize: 20, ...range, event: 'ep_play', outcome: 'success', cursor: 'next-cursor' }, '101'))
})

test('空应用不查询，迟到响应不覆盖筛选，失败可以重试', async () => {
  let resolveOld!: (value: TikTokPostbackLogPage) => void
  const list = vi.fn().mockReturnValueOnce(new Promise<TikTokPostbackLogPage>((resolve) => { resolveOld = resolve })).mockResolvedValueOnce({ ...page, items: [], hasMore: false, nextCursor: '' }).mockRejectedValueOnce(new Error('postback storage unavailable token=private')).mockResolvedValue(page)
  const notify = vi.fn()
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const view = render(<TikTokPostbackLogList api={{ listTikTokPostbackLogs: list } as unknown as OperationsApi} applicationId="" notify={notify} />)
  expect(list).not.toHaveBeenCalled()
  expect(screen.getByText('请先选择应用')).toBeInTheDocument()
  view.rerender(<TikTokPostbackLogList api={{ listTikTokPostbackLogs: list } as unknown as OperationsApi} applicationId="101" notify={notify} />)
  fireEvent.mouseDown(screen.getByLabelText('状态'))
  fireEvent.click(await screen.findByText('调用失败'))
  fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))
  await screen.findByText('暂无回传日志')
  await act(async () => resolveOld(page))
  expect(screen.queryByText('postback-event-123456')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '刷新' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(notify).toHaveBeenCalledWith('操作失败，请稍后重试', 'error')
  expect(log).toHaveBeenCalledWith('加载 TikTok 回传日志失败', { error: 'postback storage unavailable token=[已脱敏]' })
  fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
  expect(await screen.findByText('postback-event-123456')).toBeInTheDocument()
})


test('展示参数的省略、null 和空值，并解释 SDK 口径；旧记录无明细可查看', async () => {
  const detailed = { ...page.items[0], outcome: 'unknown' as const, details: { scene: 'entry_reward', clientVersion: 'build-42', params: { minis_drama_id: '123', minis_drama_name: '', if_last_ep: null, open_id: '[REDACTED]' }, warnings: ['missing_previous_episode'], elapsedMs: 10000, reason: 'callback_timeout' } }
  const list = vi.fn(async () => ({ ...page, items: [detailed] }))
  render(<TikTokPostbackLogList api={{ listTikTokPostbackLogs: list } as unknown as OperationsApi} applicationId="101" notify={vi.fn()} />)
  expect(await screen.findByText('结果未知')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
  expect(await screen.findByText('10 秒未收到回调')).toBeInTheDocument()
  const snapshot = screen.getByLabelText('脱敏回传快照') as HTMLTextAreaElement
  expect(JSON.parse(snapshot.value).details.params).toEqual(detailed.details.params)
  expect(screen.getAllByText('未传入').length).toBeGreaterThan(0)
  expect(screen.getByText('null')).toBeInTheDocument()
  expect(screen.getByText('""')).toBeInTheDocument()
  expect(screen.getByText('没有实际播放的上一集')).toBeInTheDocument()
})

test('扩展筛选随分页发送，查询重新从第一页开始', async () => {
  const list = vi.fn(async () => page)
  render(<TikTokPostbackLogList api={{ listTikTokPostbackLogs: list } as unknown as OperationsApi} applicationId="101" notify={vi.fn()} />)
  await screen.findByText('postback-event-123456')
  fireEvent.change(screen.getByLabelText('构建版本'), { target: { value: 'build-42' } })
  fireEvent.change(screen.getByLabelText('错误码'), { target: { value: '400' } })
  fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))
  await waitFor(() => expect(list).toHaveBeenLastCalledWith({ pageSize: 20, ...range, clientVersion: 'build-42', errorCode: '400' }, '101'))
  fireEvent.click(screen.getByRole('button', { name: '下一页' }))
  await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'next-cursor', clientVersion: 'build-42', errorCode: '400' }), '101'))
})

// 默认范围减少首次全量扫描，重置后仍明确展示最近七个 UTC 日期。
test('首次查询和重置均限定最近七个 UTC 自然日', async () => {
  const list = vi.fn(async () => page)
  render(<TikTokPostbackLogList api={{ listTikTokPostbackLogs: list } as unknown as OperationsApi} applicationId="101" notify={vi.fn()} />)
  await screen.findByText('postback-event-123456')
  expect(list).toHaveBeenLastCalledWith({ pageSize: 20, ...range }, '101')
  fireEvent.change(screen.getByLabelText('构建版本'), { target: { value: 'build-42' } })
  fireEvent.click(screen.getByRole('button', { name: /重\s*置/ }))
  await waitFor(() => expect(list).toHaveBeenLastCalledWith({ pageSize: 20, ...range }, '101'))
})
