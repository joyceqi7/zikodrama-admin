import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { expect, test, vi } from 'vitest'
import type { OperationsApi } from '../../api'
import type { MiniReviewSettings } from '../../applications'
import { ApiError } from '../../api'
import { ReviewSettingsManagement } from './ReviewSettingsManagement'

function setup(canUpdate = true) {
  const getReviewSettings = vi.fn(async (): Promise<MiniReviewSettings> => ({ versions: [{ version: '1.0.1', enabled: true }, { version: '1.0.2', enabled: false }], revision: 4 }))
  const saveReviewSettings = vi.fn(async (_id: string, input: MiniReviewSettings) => ({ ...input, revision: input.revision + 1 }))
  const api = { getReviewSettings, saveReviewSettings } as unknown as OperationsApi
  const notify = vi.fn()
  const editing = vi.fn()
  const result = render(<ConfigProvider theme={{ token: { motion: false } }}><ReviewSettingsManagement applicationId="9007199254740993" api={api} canUpdate={canUpdate} notify={notify} onEditingStateChange={editing} /></ConfigProvider>)
  return { api, notify, editing, getReviewSettings, saveReviewSettings, ...result }
}

async function addModal() {
  await waitFor(() => expect(screen.getByRole('button', { name: '新增发布' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '新增发布' }))
  return within(screen.getByRole('dialog'))
}

test('多版本列表通过新增发布弹窗手填版本，并保留所有已有开关', async () => {
  const { getReviewSettings, saveReviewSettings, editing } = setup()
  await screen.findByText('1.0.2')
  expect(getReviewSettings).toHaveBeenCalledWith('9007199254740993')
  expect(screen.queryByLabelText('版本号')).not.toBeInTheDocument()
  const modal = await addModal()
  expect(modal.getByRole('switch', { name: '审核开关' })).not.toBeChecked()
  fireEvent.change(modal.getByLabelText('版本号'), { target: { value: '1.0.3' } })
  fireEvent.click(modal.getByRole('switch', { name: '审核开关' }))
  expect(editing).toHaveBeenCalledWith(true, false)
  fireEvent.click(modal.getByRole('button', { name: '新增发布' }))
  await waitFor(() => expect(saveReviewSettings).toHaveBeenCalledWith('9007199254740993', { versions: [{ version: '1.0.1', enabled: true }, { version: '1.0.2', enabled: false }, { version: '1.0.3', enabled: true }], revision: 4 }))
  await screen.findByText('1.0.3')
  await waitFor(() => expect(editing).toHaveBeenLastCalledWith(false, false))
  expect(screen.getByText('命中版本后使用当前主体对应发布渠道的审核列表。')).toBeInTheDocument()
})

test('编辑一个版本只改变该版本开关，版本号不可改', async () => {
  const { saveReviewSettings } = setup()
  fireEvent.click(await screen.findByRole('button', { name: '编辑版本 1.0.2' }))
  const modal = within(screen.getByRole('dialog'))
  expect(modal.getByLabelText('版本号')).toBeDisabled()
  fireEvent.click(modal.getByRole('switch', { name: '审核开关' }))
  fireEvent.click(modal.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(saveReviewSettings).toHaveBeenCalledWith('9007199254740993', { versions: [{ version: '1.0.1', enabled: true }, { version: '1.0.2', enabled: true }], revision: 4 }))
})

test('仅查看权限展示多版本，没有新增或编辑入口', async () => {
  setup(false)
  await screen.findByText('1.0.2')
  expect(screen.queryByRole('button', { name: '新增发布' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /编辑版本/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /关闭版本/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /删除版本/ })).not.toBeInTheDocument()
})

test('确认关闭只关闭指定版本，保留记录和其他版本', async () => {
  const { saveReviewSettings } = setup()
  fireEvent.click(await screen.findByRole('button', { name: '关闭版本 1.0.1' }))
  expect(saveReviewSettings).not.toHaveBeenCalled()
  const modal = within(screen.getByRole('dialog'))
  expect(modal.getByText('确认关闭版本 1.0.1 的审核开关？')).toBeInTheDocument()
  fireEvent.click(modal.getByRole('button', { name: /关\s*闭/ }))
  await waitFor(() => expect(saveReviewSettings).toHaveBeenCalledWith('9007199254740993', { versions: [{ version: '1.0.1', enabled: false }, { version: '1.0.2', enabled: false }], revision: 4 }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByText('1.0.1')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '关闭版本 1.0.1' })).toBeDisabled()
})

test.each(['关闭', '删除'])('取消%s确认不调用接口', async (kind) => {
  const { saveReviewSettings } = setup()
  fireEvent.click(await screen.findByRole('button', { name: `${kind}版本 1.0.1` }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /取\s*消/ }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(saveReviewSettings).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '关闭版本 1.0.1' })).toBeEnabled()
})

test('删除指定版本后可继续删除最后一个版本，按最新修订提交空列表', async () => {
  const { saveReviewSettings } = setup()
  fireEvent.click(await screen.findByRole('button', { name: '删除版本 1.0.1' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /删\s*除/ }))
  await waitFor(() => expect(screen.queryByText('1.0.1')).not.toBeInTheDocument())
  expect(saveReviewSettings).toHaveBeenNthCalledWith(1, '9007199254740993', { versions: [{ version: '1.0.2', enabled: false }], revision: 4 })
  fireEvent.click(screen.getByRole('button', { name: '删除版本 1.0.2' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /删\s*除/ }))
  await waitFor(() => expect(saveReviewSettings).toHaveBeenNthCalledWith(2, '9007199254740993', { versions: [], revision: 5 }))
  await screen.findByText('暂无发布版本，点击「新增发布」手动填写版本号')
})

test('删除失败保留版本与确认框，展示友好冲突提示并允许取消', async () => {
  const { saveReviewSettings, notify } = setup()
  saveReviewSettings.mockRejectedValueOnce(new ApiError('private database details', 409, 'state_conflict'))
  fireEvent.click(await screen.findByRole('button', { name: '删除版本 1.0.1' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /删\s*除/ }))
  await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('刷新'), 'error'))
  expect(screen.getByText('1.0.1')).toBeInTheDocument()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.queryByText('private database details')).not.toBeInTheDocument()
})

test('版本格式和重复检查，取消弹窗不保存', async () => {
  const { saveReviewSettings, editing } = setup()
  const modal = await addModal()
  for (const version of ['', '01.0.1', '1.0', '1.0.1']) {
    fireEvent.change(modal.getByLabelText('版本号'), { target: { value: version } })
    expect(modal.getByRole('button', { name: '新增发布' })).toBeDisabled()
  }
  expect(modal.getByText('该版本已存在，请在列表中编辑')).toBeInTheDocument()
  fireEvent.click(modal.getByRole('button', { name: /取\s*消/ }))
  await waitFor(() => expect(editing).toHaveBeenLastCalledWith(false, false))
  expect(saveReviewSettings).not.toHaveBeenCalled()
})

test('修订冲突保留弹窗内容，不展示内部错误', async () => {
  const { saveReviewSettings, notify } = setup()
  saveReviewSettings.mockRejectedValueOnce(new ApiError('private database details', 409, 'state_conflict'))
  const modal = await addModal()
  fireEvent.change(modal.getByLabelText('版本号'), { target: { value: '1.0.3' } })
  fireEvent.click(modal.getByRole('button', { name: '新增发布' }))
  await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('刷新'), 'error'))
  expect(modal.getByLabelText('版本号')).toHaveValue('1.0.3')
  expect(screen.queryByText('private database details')).not.toBeInTheDocument()
})

test('兼容旧单版本响应，切换应用后忽略旧读取结果', async () => {
  let finish!: (value: MiniReviewSettings) => void
  const getReviewSettings = vi.fn((id: string) => id === '101' ? new Promise<MiniReviewSettings>(resolve => { finish = resolve }) : Promise.resolve({ version: '2.0.0', enabled: false, revision: 8 }))
  const api = { getReviewSettings } as unknown as OperationsApi
  const notify = vi.fn()
  const { rerender } = render(<ReviewSettingsManagement applicationId="101" api={api} canUpdate notify={notify} />)
  rerender(<ReviewSettingsManagement applicationId="102" api={api} canUpdate notify={notify} />)
  await screen.findByText('2.0.0')
  await act(async () => { finish({ version: '1.0.1', enabled: true, revision: 1 }) })
  expect(screen.queryByText('1.0.1')).not.toBeInTheDocument()
  expect(screen.getByText('2.0.0')).toBeInTheDocument()
})
