import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { OperationsApi } from '../../api'
import type { ConsumerUserPage, ConsumerUserQuery } from '../../consumerUsers'
import { ConsumerUserList } from './ConsumerUserList'

const id = '9007199254740993'
// 以本地时间构造接口时间戳，让日期展示断言不依赖执行机器的时区。
const page: ConsumerUserPage = { items: [{ id, applicationId: '101', identityType: 'tiktok', createdAt: new Date(2026, 8, 15, 8).toISOString() }], hasMore: true, nextCursor: 'next-token', pageSize: 20 }
afterEach(() => vi.restoreAllMocks())

test('观众列表按应用查询、翻页、精确搜索大整数 ID 并重置筛选', async () => {
  const list = vi.fn(async (query: ConsumerUserQuery) => query.userId ? { ...page, hasMore: false, nextCursor: '' } : page)
  const api = { listConsumerUsers: list } as unknown as OperationsApi
  render(<ConsumerUserList api={api} applicationId="101" applicationName="短剧小程序" notify={vi.fn()} />)
  expect(await screen.findByText(id)).toBeInTheDocument()
  expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['用户 ID', '所属小程序', '注册时间'])
  expect(screen.getByRole('cell', { name: '短剧小程序' })).toBeInTheDocument()
  expect(screen.getByRole('cell', { name: '2026/9/15 08:00:00' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '下一页' }))
  await waitFor(() => expect(list).toHaveBeenLastCalledWith({ cursor: 'next-token', pageSize: 20 }, '101'))
  fireEvent.change(screen.getByLabelText('用户 ID'), { target: { value: id } })
  fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))
  await waitFor(() => expect(list).toHaveBeenLastCalledWith({ pageSize: 20, userId: id }, '101'))
  expect(screen.getByRole('status')).toHaveTextContent('第 1 页')
  fireEvent.click(screen.getByRole('button', { name: /重\s*置/ }))
  await waitFor(() => expect(list).toHaveBeenLastCalledWith({ pageSize: 20 }, '101'))
  expect(screen.getByLabelText('用户 ID')).toHaveValue('')
})

test('非法主键不请求，空应用不查询且提示选择应用', async () => {
  const list = vi.fn().mockResolvedValue(page)
  const api = { listConsumerUsers: list } as unknown as OperationsApi
  const view = render(<ConsumerUserList api={api} applicationId="" notify={vi.fn()} />)
  expect(list).not.toHaveBeenCalled()
  expect(screen.getByText('请先选择应用')).toBeInTheDocument()
  view.rerender(<ConsumerUserList api={api} applicationId="101" notify={vi.fn()} />)
  await screen.findByText(id)
  expect(screen.getByRole('cell', { name: '101' })).toBeInTheDocument()
  for (const value of ['01', '1e8', '18446744073709551616']) {
    fireEvent.change(screen.getByLabelText('用户 ID'), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('请输入有效的完整用户 ID')
  }
  expect(list).toHaveBeenCalledTimes(1)
})

test('旧响应不能覆盖新筛选，失败可重试且日志保留错误详情并脱敏', async () => {
  let resolveOld!: (page: ConsumerUserPage) => void
  const list = vi.fn().mockReturnValueOnce(new Promise<ConsumerUserPage>((resolve) => { resolveOld = resolve })).mockResolvedValueOnce({ ...page, items: [], hasMore: false, nextCursor: '' }).mockRejectedValueOnce(new Error('database unavailable token=secret-value')).mockResolvedValue(page)
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const notify = vi.fn()
  render(<ConsumerUserList api={{ listConsumerUsers: list } as unknown as OperationsApi} applicationId="101" notify={notify} />)
  fireEvent.change(screen.getByLabelText('用户 ID'), { target: { value: id } })
  fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))
  await screen.findByText('未找到匹配用户')
  await act(async () => resolveOld(page))
  expect(screen.queryByText(id)).not.toBeInTheDocument()
  expect(log).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '刷新' }))
  await screen.findByRole('alert')
  expect(log).toHaveBeenCalledWith('加载观众用户列表失败', { error: 'database unavailable token=[已脱敏]' })
  fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
  expect(await screen.findByText(id)).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('游标支持返回上一页、末页停止和刷新回到首页', async () => {
  const list = vi.fn(async (query) => query.cursor ? { ...page, hasMore: false, nextCursor: '', items: [{ ...page.items[0], id: '9007199254740992' }] } : page)
  render(<ConsumerUserList api={{ listConsumerUsers: list } as unknown as OperationsApi} applicationId="101" notify={vi.fn()} />)
  await screen.findByText(id)
  expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '下一页' }))
  await screen.findByText('9007199254740992')
  expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('第 2 页')
  fireEvent.click(screen.getByRole('button', { name: '上一页' }))
  await screen.findByText(id)
  fireEvent.click(screen.getByRole('button', { name: '下一页' }))
  await screen.findByText('9007199254740992')
  fireEvent.click(screen.getByRole('button', { name: '刷新' }))
  await screen.findByText(id)
  expect(screen.getByRole('status')).toHaveTextContent('第 1 页')
  expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()
})
