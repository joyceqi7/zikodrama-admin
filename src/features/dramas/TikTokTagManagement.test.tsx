import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { expect, it, vi } from 'vitest'
import type { OperationsApi } from '../../api'
import { TikTokTagManagement } from './TikTokTagManagement'
function fixture() {
  let tag = { id: '21', officialName: '悬疑推理', englishName: '', dramaCount: 7 }
  return {
    listTikTokTags: vi.fn(async () => [tag]),
    updateTikTokTag: vi.fn(async (id: string, englishName: string) => { tag = { ...tag, id, englishName }; return { id: tag.id, officialName: tag.officialName, englishName: tag.englishName } }),
  } as unknown as OperationsApi
}
it('编辑、刷新读回、英文搜索和清空翻译', async () => {
  const api = fixture()
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    render(<ConfigProvider theme={{ token: { motion: false } }}><TikTokTagManagement api={api} canUpdate /></ConfigProvider>)
    fireEvent.click(await screen.findByRole('button', { name: '编辑 悬疑推理 英文翻译' }))
    fireEvent.change(screen.getByLabelText('英文翻译'), { target: { value: '  Mystery  ' } })
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
    await screen.findByText('Mystery')
    expect(screen.getByText('7 部短剧')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.updateTikTokTag).toHaveBeenCalledWith('21', 'Mystery')
    fireEvent.click(screen.getByRole('button', { name: /刷\s*新/ }))
    await waitFor(() => expect(api.listTikTokTags).toHaveBeenCalledTimes(2))
    fireEvent.change(screen.getByLabelText('搜索 TikTok 标签'), { target: { value: 'mystery' } })
    expect(screen.getByText('悬疑推理')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('搜索 TikTok 标签'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '编辑 悬疑推理 英文翻译' }))
    fireEvent.change(screen.getByLabelText('英文翻译'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
    await screen.findByText('未翻译')
    expect(api.updateTikTokTag).toHaveBeenLastCalledWith('21', '')
    expect(log).not.toHaveBeenCalled()
  } finally { log.mockRestore() }
})
it('只读账号看不到编辑入口', async () => {
  render(<ConfigProvider theme={{ token: { motion: false } }}><TikTokTagManagement api={fixture()} canUpdate={false} /></ConfigProvider>)
  await screen.findByText('悬疑推理')
  expect(screen.queryByRole('button', { name: /编辑/ })).not.toBeInTheDocument()
})
it('失败保留输入且允许重试，日志保留错误原因并脱敏', async () => {
  const api = fixture(), log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.mocked(api.updateTikTokTag).mockRejectedValueOnce(new Error('database unavailable token=private-secret'))
  try {
    render(<ConfigProvider theme={{ token: { motion: false } }}><TikTokTagManagement api={api} canUpdate /></ConfigProvider>)
    fireEvent.click(await screen.findByRole('button', { name: '编辑 悬疑推理 英文翻译' }))
    fireEvent.change(screen.getByLabelText('英文翻译'), { target: { value: 'Mystery' } })
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('英文翻译')).toHaveValue('Mystery')
    expect(JSON.stringify(log.mock.calls)).toContain('database unavailable')
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-secret')
    expect(screen.queryByText(/database unavailable/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
    await screen.findByText('Mystery')
    expect(screen.getByText('7 部短剧')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  } finally { log.mockRestore() }
})

it('展示零关联且兼容旧后端缺少数量，不能把未知显示为零', async () => {
  const api = fixture()
  vi.mocked(api.listTikTokTags).mockResolvedValue([
    { id: '21', officialName: '悬疑推理', dramaCount: 0 },
    { id: '22', officialName: '奇幻' },
  ])
  render(<ConfigProvider theme={{ token: { motion: false } }}><TikTokTagManagement api={api} canUpdate={false} /></ConfigProvider>)
  expect(await screen.findByRole('columnheader', { name: '关联短剧' })).toBeInTheDocument()
  expect(await screen.findByText('0 部短剧')).toBeInTheDocument()
  expect(screen.getByText('—')).toBeInTheDocument()
})
