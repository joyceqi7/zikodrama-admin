import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { OperationsApi } from '../../api'
import type { AdAnalytics } from '../../adAnalytics'
import { AdAnalyticsPage } from './AdAnalyticsPage'

const page: AdAnalytics = {
  summary: { timingSamples: 4, closeUnknown: 0, calls: 10, requests: 8, shown: 5, matchedShown: 4, completed: 2, failedBeforeShow: 1, failedAfterShow: 1, createFailures: 1, cancelled: 1, unknown: 2, pending: 1, skipped: 1, p50Ms: 100, p95Ms: 500 },
  daily: [], errors: [], items: [{ userId: '9007199254740993', eventId: 'example-ad-call-12345', occurredAt: '2026-10-21T01:02:03Z', adType: 'rewarded', adUnitId: 'slot-1', scene: 'entry_reward', clientVersion: 'build-42', requested: 1, shown: 1, completed: 0, failed: 1, cancelled: 0, unknown: 1, closed: 0, skipped: 0, events: [{ kind: 'ad_shown', stage: 'show', evidence: 'show_promise', showElapsedMs: 100, os: 'ios', tiktokVersion: '46.1.0', receivedAt: '2026-10-21T01:02:04Z' }] }], hasMore: true, nextCursor: 'cursor-1', generatedAt: '2026-10-21T01:03:00Z',
}

test('按广告位筛选并分页，展示后失败仍保留展示事实和迟到标记', async () => {
  const read = vi.fn(async () => page)
  render(<AdAnalyticsPage api={{ adAnalytics: read } as unknown as OperationsApi} applicationId="101" notify={vi.fn()} />)
  expect(await screen.findByText('50.00%')).toBeInTheDocument()
  // 孤立展示保留在展示总数中，但不能加入关联请求的转化率分子。
  expect(screen.queryByText('62.50%')).not.toBeInTheDocument()
  expect(screen.getByText(/旧流程的请求分母不包含加载失败/)).toBeInTheDocument()
  fireEvent.click(screen.getByText('其他调用结果'))
  expect(await screen.findByText('创建 / 准备失败')).toBeInTheDocument()
  expect(screen.getByText('关闭结果未知')).toBeInTheDocument()
  for (const label of ['加载请求', '加载成功', '加载结果未知', '加载与其他结果']) {
    expect(screen.queryByText(label)).not.toBeInTheDocument()
  }
  expect(screen.getAllByText('展示后失败').length).toBeGreaterThan(0)
  expect(screen.getByText('曾超时')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('广告位'), { target: { value: 'slot-1' } })
  fireEvent.change(screen.getByLabelText('构建版本'), { target: { value: 'build-direct' } })
  fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))
  await waitFor(() => expect(read).toHaveBeenLastCalledWith(expect.objectContaining({ adUnitId: 'slot-1', clientVersion: 'build-direct', cursor: undefined }), '101'))
  fireEvent.click(screen.getByRole('button', { name: '下一页' }))
  await waitFor(() => expect(read).toHaveBeenLastCalledWith(expect.objectContaining({ adUnitId: 'slot-1', cursor: 'cursor-1' }), '101'))
  fireEvent.click(screen.getByRole('button', { name: '查看明细' }))
  expect(await screen.findByText('9007199254740993')).toBeInTheDocument()
  expect(screen.getByText('SDK 展示成功')).toBeInTheDocument()
})

test('空应用不读取，旧响应不覆盖新应用，故障映射为友好提示并脱敏日志', async () => {
  let finish!: (value: AdAnalytics) => void
  const read = vi.fn().mockReturnValueOnce(new Promise(resolve => { finish = resolve })).mockResolvedValueOnce({ ...page, items: [] }).mockRejectedValueOnce(new Error('database error token=secret'))
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const notify = vi.fn()
  const api = { adAnalytics: read } as unknown as OperationsApi
  const view = render(<AdAnalyticsPage api={api} applicationId="" notify={notify} />)
  expect(read).not.toHaveBeenCalled()
  view.rerender(<AdAnalyticsPage api={api} applicationId="101" notify={notify} />)
  view.rerender(<AdAnalyticsPage api={api} applicationId="102" notify={notify} />)
  await screen.findByText('暂无调用明细')
  await act(async () => finish(page))
  expect(screen.queryByText('example-ad-call-12345')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '刷新' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(notify).toHaveBeenCalledWith('操作失败，请稍后重试', 'error')
  expect(JSON.stringify(log.mock.calls)).not.toContain('secret')
  log.mockRestore()
})

test('11006 汇总与原始码并存，明细通过调用 ID 关联日志', async () => {
  const data: AdAnalytics = { ...page, errors: [{ stage: 'show', errorCode: '11006', subErrorCode: '11006', reason: 'ad_active_conflict', count: 425 }], items: [{ ...page.items[0], events: [
    page.items[0].events[0],
    { kind: 'ad_failure', stage: 'show', errorCode: '104111006', subErrorCode: '11006', reason: 'ad_active_conflict', os: 'ios', tiktokVersion: '46.1', receivedAt: page.generatedAt },
  ] }] }
  render(<AdAnalyticsPage api={{ adAnalytics: vi.fn(async () => data) } as unknown as OperationsApi} applicationId="101" notify={vi.fn()} />)
  expect(await screen.findByText('425')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '查看明细' }))
  expect(await screen.findByText('104111006 / 11006 / —')).toBeInTheDocument()
  expect(screen.getByText(/失败诊断仅写日志服务/)).toBeInTheDocument()
  expect(screen.queryByText('原生调用与锁时序')).not.toBeInTheDocument()
})


test('50008 保留独立内部码和分类筛选，不展示诊断快照', async () => {
  const data: AdAnalytics = { ...page, errors: [{ stage: 'show', errorCode: '50008', subErrorCode: '50008', reason: 'container_unavailable', count: 275 }], items: [{ ...page.items[0], events: [{
    ...page.items[0].events[0], kind: 'ad_failure', reason: 'container_unavailable', errorCode: '101150000', subErrorCode: '50000', innerErrorCode: '50008',
  }] }] }
  const read = vi.fn(async () => data)
  render(<AdAnalyticsPage api={{ adAnalytics: read } as unknown as OperationsApi} applicationId="101" notify={vi.fn()} />)
  await screen.findByText('275')
  fireEvent.change(screen.getByLabelText('错误码'), { target: { value: '50008' } })
  fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))
  await waitFor(() => expect(read).toHaveBeenLastCalledWith(expect.objectContaining({ errorCode: '50008' }), '101'))
  fireEvent.click(screen.getByRole('button', { name: '查看明细' }))
  expect(await screen.findByText('101150000 / 50000 / 50008')).toBeInTheDocument()
  expect(screen.queryByText('原生调用与锁时序')).not.toBeInTheDocument()
})
