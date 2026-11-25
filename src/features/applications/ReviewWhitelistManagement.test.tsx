import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { expect, test, vi } from 'vitest'
import type { OperationsApi } from '../../api'
import { ReviewWhitelistManagement } from './ReviewWhitelistManagement'

const rows = [
  { id: '201', title: '已添加剧目', coverUrl: '' },
  { id: '202', title: '第一页候选', coverUrl: '' },
  { id: '203', title: '第二页候选', coverUrl: '' },
]
function setup(canUpdate = true) {
  const get = vi.fn(async () => ({ revision: 4, dramaIds: ['201'], dramas: [rows[0]] }))
  const save = vi.fn(async (_channel: string, _subjectId: string, input: { revision: number; dramaIds: string[] }) => ({
    ...input, revision: input.revision + 1, dramas: rows.filter(row => input.dramaIds.includes(row.id)),
  }))
  const targets = vi.fn(async (_channel: string, _subjectId: string, _query: string, cursor: string) =>
    cursor ? { items: [rows[2]] } : { items: rows.slice(0, 2), nextCursor: 'page-2' })
  const api = { getReviewWhitelist: get, saveReviewWhitelist: save, reviewWhitelistTargets: targets } as unknown as OperationsApi
  const notify = vi.fn()
  render(<ConfigProvider theme={{ token: { motion: false } }}>
    <ReviewWhitelistManagement subjectId="9007199254740993" channel="direct" api={api} canUpdate={canUpdate} notify={notify} />
  </ConfigProvider>)
  return { get, save, targets }
}

test('跨页选剧确认后直接保存，移除时使用最新修订', async () => {
  const { get, save, targets } = setup()
  await screen.findByText('已添加剧目')
  expect(get).toHaveBeenCalledWith('direct', '9007199254740993')
  expect(targets).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: '保存清单' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '添加短剧' }))
  const dialog = within(await screen.findByRole('dialog'))
  expect(dialog.getByText('已添加剧目')).toBeInTheDocument()
  expect(dialog.queryByRole('checkbox', { name: '选择 已添加剧目' })).not.toBeInTheDocument()
  fireEvent.click(await dialog.findByRole('checkbox', { name: '选择 第一页候选' }))
  fireEvent.click(dialog.getByRole('button', { name: '下一页' }))
  fireEvent.click(await dialog.findByRole('checkbox', { name: '选择 第二页候选' }))
  expect(targets).toHaveBeenLastCalledWith('direct', '9007199254740993', '', 'page-2')
  fireEvent.click(dialog.getByRole('button', { name: '添加所选（2）' }))
  await waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith('direct', '9007199254740993', { revision: 4, dramaIds: ['201', '202', '203'] }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: '移除 第二页候选' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: '移除 已添加剧目' }))
  await waitFor(() => expect(save).toHaveBeenLastCalledWith('direct', '9007199254740993', { revision: 5, dramaIds: ['202', '203'] }))
  await waitFor(() => expect(screen.queryByRole('button', { name: '移除 已添加剧目' })).not.toBeInTheDocument())
})

test('自动保存失败时保留选择和原列表，确认后可重试', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const { save } = setup()
    save.mockRejectedValueOnce(new Error('write failed'))
    await screen.findByText('已添加剧目')
    fireEvent.click(screen.getByRole('button', { name: '添加短剧' }))
    const dialog = within(await screen.findByRole('dialog'))
    const candidate = await dialog.findByRole('checkbox', { name: '选择 第一页候选' })
    fireEvent.click(candidate)
    fireEvent.click(dialog.getByRole('button', { name: '添加所选（1）' }))
    expect(await dialog.findByRole('alert')).not.toHaveTextContent('write failed')
    expect(log).toHaveBeenCalledWith('添加审核短剧失败', { error: 'write failed' })
    expect(candidate).toBeChecked()
    expect(screen.queryByRole('button', { name: '移除 第一页候选' })).not.toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: /添加所选（1）/ }))
    await waitFor(() => expect(save).toHaveBeenLastCalledWith('direct', '9007199254740993', { revision: 4, dramaIds: ['201', '202'] }))
    expect(save).toHaveBeenCalledTimes(2)
    expect(await screen.findByRole('button', { name: '移除 第一页候选' })).toBeInTheDocument()
  } finally {
    log.mockRestore()
  }
})

test('查看权限只读取已配置清单', async () => {
  const { targets } = setup(false)
  await screen.findByText('已添加剧目')
  expect(screen.queryByRole('button', { name: '添加短剧' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '移除 已添加剧目' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '保存清单' })).not.toBeInTheDocument()
  expect(targets).not.toHaveBeenCalled()
})
