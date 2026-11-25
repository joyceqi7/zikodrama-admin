import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { OperationsApi } from '../../api'
import type { Subject } from '../../subjects'
import { SubjectManagement } from './SubjectManagement'

const subject: Subject = { id: '1', name: '现有主体', remark: '', tiktokAppId: '0009007199254740993', clientKey: 'publisher-key', clientSecretConfigured: true, createdAt: '', updatedAt: '' }

function setup(overrides: Partial<OperationsApi> = {}, onChanged = vi.fn(async () => {}), canUpdate = true) {
  const createSubject = vi.fn(async input => ({ ...subject, ...input, id: '2' }))
  const updateSubject = vi.fn(async (_id, input) => ({ ...subject, ...input }))
  const api = { listSubjects: vi.fn(async () => [subject]), createSubject, updateSubject, ...overrides } as unknown as OperationsApi
  const notify = vi.fn()
  render(<SubjectManagement api={api} canCreate={canUpdate} canUpdate={canUpdate} onChanged={onChanged} notify={notify} />)
  return { createSubject, updateSubject, onChanged, notify }
}

test('更新资料不回显密钥，留空时保留服务端现值', async () => {
  const { updateSubject } = setup()
  fireEvent.click(await screen.findByRole('button', { name: '编辑主体 现有主体' }))
  const drawer = within(screen.getByRole('dialog'))
  expect(drawer.getByLabelText('发布方 TikTok App ID')).toHaveValue('0009007199254740993')
  expect(drawer.getByLabelText('发布方 Client Secret')).toHaveValue('')
  fireEvent.change(drawer.getByLabelText('主体名称'), { target: { value: '主体改名' } })
  fireEvent.click(drawer.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(updateSubject).toHaveBeenCalledWith('1', expect.objectContaining({ name: '主体改名', tiktokAppId: subject.tiktokAppId, clientKey: subject.clientKey })))
  expect(updateSubject.mock.calls[0][1].clientSecret).toBeUndefined()
})

test('允许先建无发布方主体，选项刷新失败不会诱发重复创建', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const onChanged = vi.fn(async () => { throw new Error('reload unavailable token=private-secret') })
  try {
    const { createSubject, notify } = setup({}, onChanged)
    fireEvent.click(screen.getByRole('button', { name: '新建主体' }))
    const drawer = within(screen.getByRole('dialog'))
    fireEvent.change(drawer.getByLabelText('主体名称'), { target: { value: '空主体' } })
    fireEvent.click(drawer.getByRole('button', { name: /保\s*存/ }))
    await waitFor(() => expect(notify).toHaveBeenCalledWith('主体已保存'))
    await waitFor(() => expect(log).toHaveBeenCalledWith('刷新主体选择项失败', { error: 'reload unavailable token=[已脱敏]' }))
    expect(createSubject).toHaveBeenCalledTimes(1)
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('空主体')).toBeInTheDocument()
  } finally { log.mockRestore() }
})

test('无编辑权限时不开放新增和修改，也不展示密钥原文', async () => {
  setup({}, undefined, false)
  expect(await screen.findByRole('button', { name: '编辑主体 现有主体' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: '新建主体' })).not.toBeInTheDocument()
  expect(screen.getByText('已配置')).toBeInTheDocument()
})

test('非法 App ID 在表单内拒绝，成功读取不记录失败日志', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const { createSubject } = setup()
    await screen.findByText('现有主体')
    fireEvent.click(screen.getByRole('button', { name: '新建主体' }))
    const drawer = within(screen.getByRole('dialog'))
    fireEvent.change(drawer.getByLabelText('主体名称'), { target: { value: '主体 B' } })
    fireEvent.change(drawer.getByLabelText('发布方 TikTok App ID'), { target: { value: 'invalid!' } })
    fireEvent.click(drawer.getByRole('button', { name: /保\s*存/ }))
    expect(await screen.findByText('请输入数字字符串 App ID')).toBeInTheDocument()
    expect(createSubject).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  } finally { log.mockRestore() }
})

test('主体共用全局 VOD 空间，主体表单只保存资料与发布方', async () => {
  const { updateSubject } = setup()
  expect(await screen.findByText('各主体独立维护短剧和 TikTok 发布方，共用全局 VOD 空间。')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '编辑主体 现有主体' }))
  const drawer = within(screen.getByRole('dialog'))
  expect(drawer.queryByLabelText('VOD 空间名称')).not.toBeInTheDocument()
  fireEvent.change(drawer.getByLabelText('主体名称'), { target: { value: '共享空间主体' } })
  fireEvent.click(drawer.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(updateSubject).toHaveBeenCalledWith('1', expect.objectContaining({ name: '共享空间主体' })))
  expect(updateSubject.mock.calls[0][1]).not.toHaveProperty('vodSpaceName')
})
