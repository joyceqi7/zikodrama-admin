import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { OperationsApi } from '../../api'
import { ApiError } from '../../api'
import type { AdminPermission } from '../../domain'
import { PermissionManagement } from './PermissionManagement'

const root: AdminPermission = { id: '9007199254740993', parentId: '', name: '内容中心', code: 'custom.content', type: 'directory', route: '', sortOrder: 0, status: 'active', remark: '', createdAt: '', updatedAt: '' }
const child: AdminPermission = { ...root, id: '9007199254740994', parentId: root.id, name: '查看短剧', code: 'content.drama.read', type: 'action' }
const can = () => true

test('展示权限树，新增和编辑后重新读取持久化资料并刷新导航', async () => {
  let items = [root, child]
  const createPermission = vi.fn(async (input) => { const item = { ...input, id: '9007199254740995', createdAt: '', updatedAt: '' }; items = [...items, item]; return item })
  const updatePermission = vi.fn(async (id, input) => { const item = { ...input, id, createdAt: '', updatedAt: '' }; items = items.map((old) => old.id === id ? item : old); return item })
  const onChanged = vi.fn(async () => undefined)
  const api = { listPermissions: vi.fn(async () => items), createPermission, updatePermission } as unknown as OperationsApi
  render(<PermissionManagement api={api} can={can} onChanged={onChanged} />)
  await screen.findByText('内容中心')
  // 树表父节点可以展开查看子操作。
  const parentRow = screen.getByText('内容中心').closest('tr')!
  const expand = within(parentRow).queryByRole('button', { name: /Expand|展开/ })
  if (expand) fireEvent.click(expand)
  expect(await screen.findByText('查看短剧')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '新增权限' }))
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('权限名称'), { target: { value: '运营中心' } })
  fireEvent.change(within(dialog).getByLabelText('权限编码'), { target: { value: 'custom.operations' } })
  fireEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(createPermission).toHaveBeenCalledWith(expect.objectContaining({ name: '运营中心', code: 'custom.operations', parentId: '', type: 'directory' })))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  fireEvent.click(await screen.findByRole('button', { name: '编辑 运营中心' }))
  fireEvent.change(screen.getByLabelText('权限名称'), { target: { value: '海外运营' } })
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /保\s*存/ }))
  await screen.findByText('海外运营')
  expect(updatePermission).toHaveBeenCalledWith('9007199254740995', expect.objectContaining({ name: '海外运营' }))
  expect(onChanged).toHaveBeenCalledTimes(2)
})

test('只有查看权限时展示树，不提供写入口', async () => {
  render(<PermissionManagement api={{ listPermissions: vi.fn(async () => [root]) } as unknown as OperationsApi} can={() => false} />)
  await screen.findByText('内容中心')
  expect(screen.queryByRole('button', { name: /新增|编辑|删除/ })).not.toBeInTheDocument()
})

test('新增页面直接填写站内路径', async () => {
  const createPermission = vi.fn(async (input) => ({ ...input, id: '9007199254740995', createdAt: '', updatedAt: '' }))
  const api = { listPermissions: vi.fn(async () => [root]), createPermission } as unknown as OperationsApi
  render(<PermissionManagement api={api} can={can} />)
  fireEvent.click(await screen.findByRole('button', { name: '在 内容中心 下新增权限' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByLabelText('节点类型').closest('.ant-select')).toHaveTextContent('页面')
  fireEvent.change(within(dialog).getByLabelText('权限名称'), { target: { value: '回传日志' } })
  fireEvent.change(within(dialog).getByLabelText('权限编码'), { target: { value: 'menu.postbacklogs' } })
  fireEvent.change(within(dialog).getByLabelText('页面路径'), { target: { value: '/channels/postback-logs' } })
  const icons = within(dialog).getByRole('group', { name: '导航图标' })
  expect(within(icons).queryByText('回传日志')).not.toBeInTheDocument()
  fireEvent.click(within(icons).getByRole('button', { name: '选择文档图标' }))
  fireEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(createPermission).toHaveBeenCalledWith(expect.objectContaining({ type: 'menu', route: '/channels/postback-logs', icon: 'scroll-text' })))
})

test('引用冲突显示统一错误并保留节点，记录失败诊断', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const deletePermission = vi.fn().mockRejectedValue(new ApiError('该记录仍被使用', 409, 'conflict'))
  render(<PermissionManagement api={{ listPermissions: vi.fn(async () => [root]), deletePermission } as unknown as OperationsApi} can={can} />)
  fireEvent.click(await screen.findByRole('button', { name: '删除 内容中心' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /删\s*除/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('当前状态不支持此操作，或内容已重复，请刷新检查后重试')
  expect(screen.getByText('内容中心')).toBeInTheDocument()
  expect(logged).toHaveBeenCalledWith('admin permission operation failed', expect.objectContaining({ operation: '删除权限节点', error: '该记录仍被使用' }))
  logged.mockRestore()
})

test('加载失败不展示原始异常并可刷新恢复', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const listPermissions = vi.fn().mockRejectedValueOnce(new Error('private browser details')).mockResolvedValue([root])
  render(<PermissionManagement api={{ listPermissions } as unknown as OperationsApi} can={() => false} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('操作失败，请稍后重试')
  expect(screen.queryByText('private browser details')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /刷\s*新/ }))
  await screen.findByText('内容中心')
  logged.mockRestore()
})
