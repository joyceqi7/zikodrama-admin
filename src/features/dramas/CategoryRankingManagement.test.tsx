import { ConfigProvider } from 'antd'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { OperationsApi } from '../../api'
import type { RankingConfig, RankingView } from '../../categoryRankings'
import { CategoryRankingManagement } from './CategoryRankingManagement'

const dramas = [{ id: '1', title: 'First Drama', coverUrl: '' }, { id: '2', title: 'Second Drama', coverUrl: '' }]
function fixture() {
  let stored: RankingView = { revision: 0, items: dramas.map(item => ({ dramaId: item.id, visible: true })), dramas }
  return {
    rankingCategories: vi.fn(async () => [{ tag: { id: '21', officialName: '悬疑推理', englishName: 'Mystery' }, count: 2 }, { tag: { id: '22', officialName: '都市', englishName: '' }, count: 0 }]),
    categoryRanking: vi.fn(async (tag: string) => tag === '21' ? stored : { revision: 0, items: [], dramas: [] }),
    saveCategoryRanking: vi.fn(async (_tag: string, input: RankingConfig) => { stored = { ...input, revision: input.revision + 1, dramas }; return stored }),
    rankingTargets: vi.fn(async () => ({ items: [{ id: '3', title: 'Third Drama', coverUrl: '' }] })),
  } as unknown as OperationsApi
}
function mount(api: OperationsApi, canUpdate = true) {
  return render(<ConfigProvider theme={{ token: { motion: false } }}><CategoryRankingManagement api={api} canUpdate={canUpdate} notify={vi.fn()} /></ConfigProvider>)
}

it('分类切换和排序正常，隐藏保留成员及分类数量', async () => {
  const api = fixture(); mount(api)
  fireEvent.click(await screen.findByRole('button', { name: '下移第 1 部' }))
  await waitFor(() => expect(screen.getAllByRole('row')[1]).toHaveTextContent('Second Drama'))
  expect(api.saveCategoryRanking).toHaveBeenLastCalledWith('21', { revision: 0, items: [{ dramaId: '2', visible: true }, { dramaId: '1', visible: true }] })
  fireEvent.click(screen.getByRole('switch', { name: '展示 Second Drama' }))
  await waitFor(() => expect(screen.getByRole('switch', { name: '展示 Second Drama' })).toHaveAttribute('aria-checked', 'false'))
  expect(screen.getByText('First Drama')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /移除|恢复/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Mystery 2' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: '都市 0' }))
  await screen.findByText('暂无已上线且属于此标签的短剧')
  expect(api.categoryRanking).toHaveBeenLastCalledWith('22')
})

it('数字排名在输入完成后保存，隐藏后重新展示不改变排名', async () => {
  const api = fixture(); mount(api)
  const rank = await screen.findByRole('spinbutton', { name: '第 1 部排序' })
  expect(screen.queryByRole('button', { name: '添加短剧' })).not.toBeInTheDocument()
  expect(api.rankingTargets).not.toHaveBeenCalled()
  fireEvent.change(rank, { target: { value: '2' } })
  expect(api.saveCategoryRanking).not.toHaveBeenCalled()
  fireEvent.blur(rank)
  await waitFor(() => expect(screen.getAllByRole('row')[1]).toHaveTextContent('Second Drama'))
  fireEvent.click(screen.getByRole('switch', { name: '展示 First Drama' }))
  await waitFor(() => expect(screen.getByRole('switch', { name: '展示 First Drama' })).toHaveAttribute('aria-checked', 'false'))
  expect(api.saveCategoryRanking).toHaveBeenLastCalledWith('21', expect.objectContaining({ items: [{ dramaId: '2', visible: true }, { dramaId: '1', visible: false }] }))
  fireEvent.click(screen.getByRole('switch', { name: '展示 First Drama' }))
  await waitFor(() => expect(screen.getByRole('switch', { name: '展示 First Drama' })).toHaveAttribute('aria-checked', 'true'))
  expect(screen.getByRole('button', { name: 'Mystery 2' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getAllByRole('row')[2]).toHaveTextContent('First Drama')
})

it('只读用户不能排序、隐藏或移除', async () => {
  mount(fixture(), false)
  expect(await screen.findByRole('switch', { name: '展示 First Drama' })).toBeDisabled()
  expect(screen.getByRole('spinbutton', { name: '第 1 部排序' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: /移除|添加短剧/ })).not.toBeInTheDocument()
})

it('保存故障保留顺序并锁定写操作，重新加载恢复，日志有原因且不暴露凭据', async () => {
  const api = fixture(), log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.mocked(api.saveCategoryRanking).mockRejectedValueOnce(new Error('redis write refused token=private-secret'))
  try {
    mount(api); await screen.findByText('First Drama'); fireEvent.click(screen.getByLabelText('下移第 1 部'))
    await screen.findByText('重新加载')
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('First Drama')
    expect(screen.getByLabelText('下移第 1 部')).toBeDisabled()
    expect(JSON.stringify(log.mock.calls)).toContain('redis write refused')
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-secret')
    expect(screen.queryByText(/redis write refused/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('重新加载'))
    await waitFor(() => expect(screen.getByLabelText('下移第 1 部')).not.toBeDisabled())
  } finally { log.mockRestore() }
})

it('切换分类后忽略前一分类迟到的响应', async () => {
  const api = fixture(); let resolve!: (value: RankingView) => void
  vi.mocked(api.categoryRanking).mockImplementationOnce(() => new Promise(done => { resolve = done }))
  mount(api)
  fireEvent.click(await screen.findByRole('button', { name: '都市 0' }))
  await screen.findByText('暂无已上线且属于此标签的短剧')
  await act(async () => resolve({ revision: 10, items: [{ dramaId: '1', visible: true }], dramas }))
  expect(screen.queryByText('First Drama')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '都市 0' })).toHaveAttribute('aria-pressed', 'true')
})
