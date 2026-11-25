import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { ApiError, type OperationsApi } from '../../api'
import { permissionCodes, type AdminPermission, type AdminRole } from '../../domain'
import { RoleManagement } from './RoleManagement'

const permissions: AdminPermission[] = [
  { parentId: '', type: 'action', route: '', sortOrder: 0, status: 'active', remark: '', id: '9007199254740993', name: '查看短剧', code: 'content.drama.read', createdAt: '', updatedAt: '' },
  { parentId: '', type: 'action', route: '', sortOrder: 1, status: 'active', remark: '', id: '9007199254740994', name: '发布短剧', code: 'content.drama.publish', createdAt: '', updatedAt: '' },
]
const role: AdminRole = { id: '9007199254740995', name: '内容运营', code: 'content_operator', remark: '', status: 'active', permissionIds: ['9007199254740993'], createdAt: '', updatedAt: '' }

test('角色按大整数的字符串 ID 选择和保存权限，不丢失精度', async () => {
  let current = role
  const setRolePermissions = vi.fn(async (_id: string, permissionIds: string[]) => { current = { ...current, permissionIds } })
  const api = { listRoles: vi.fn(async () => [current]), listPermissions: vi.fn(async () => permissions), setRolePermissions } as unknown as OperationsApi
  const allowed = new Set<string>([permissionCodes.roleRead, permissionCodes.roleAssign, permissionCodes.permissionRead])
  const can = (code: string) => allowed.has(code)
  render(<RoleManagement api={api} can={can} notify={vi.fn()} />)

  fireEvent.click(await screen.findByRole('button', { name: '配置 内容运营 的权限' }))
  const dialog = screen.getByRole('dialog')
  const read = within(dialog).getByRole('checkbox', { name: /查看短剧/ })
  const publish = within(dialog).getByRole('checkbox', { name: /发布短剧/ })
  expect(read).toBeChecked()
  expect(publish).not.toBeChecked()
  fireEvent.click(read)
  fireEvent.click(publish)
  fireEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }))

  await waitFor(() => expect(setRolePermissions).toHaveBeenCalledWith('9007199254740995', ['9007199254740994']))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: '配置 内容运营 的权限' }))
  expect(within(screen.getByRole('dialog')).getByRole('checkbox', { name: /发布短剧/ })).toBeChecked()
  expect(within(screen.getByRole('dialog')).getByRole('checkbox', { name: /查看短剧/ })).not.toBeChecked()
})

test('只读角色账号不会出现权限分配和角色写操作', async () => {
  const api = { listRoles: vi.fn(async () => [role]), listPermissions: vi.fn(async () => permissions) } as unknown as OperationsApi
  render(<RoleManagement api={api} can={(code) => code === permissionCodes.roleRead} notify={vi.fn()} />)

  await screen.findByText('内容运营')
  expect(screen.queryByRole('button', { name: /配置|编辑|删除|新建/ })).not.toBeInTheDocument()
  expect(api.listPermissions).not.toHaveBeenCalled()
})

test('权限保存失败保留选择并记录安全日志，重试成功后刷新会话', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    const setRolePermissions = vi.fn().mockRejectedValueOnce(new ApiError('当前无权修改角色权限', 403, 'forbidden')).mockResolvedValueOnce(undefined)
    const api = { listRoles: vi.fn(async () => [role]), listPermissions: vi.fn(async () => permissions), setRolePermissions } as unknown as OperationsApi
    const refresh = vi.fn(async () => undefined)
    const notify = vi.fn()
    render(<RoleManagement api={api} can={() => true} notify={notify} onPermissionsChanged={refresh} />)
    fireEvent.click(await screen.findByRole('button', { name: '配置 内容运营 的权限' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('checkbox', { name: /发布短剧/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /保\s*存/ }))
    await waitFor(() => expect(notify).toHaveBeenCalledWith('你暂无此操作权限，请联系管理员开通', 'error'))
    expect(logged).toHaveBeenCalledWith('save admin role permissions failed', { roleId: role.id, error: '当前无权修改角色权限' })
    expect(refresh).not.toHaveBeenCalled()
    expect(within(screen.getByRole('dialog')).getByRole('checkbox', { name: /发布短剧/ })).toBeChecked()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /保\s*存/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(refresh).toHaveBeenCalledOnce()
    expect(logged).toHaveBeenCalledOnce()
  } finally {
    logged.mockRestore()
  }
})

test('重新打开角色树不会隐式授权新子节点，主动勾选父节点才选择当前子树', async () => {
  const parent: AdminPermission = { ...permissions[0], id: '9007199254740996', parentId: '', code: 'custom.group', name: '内容权限组', type: 'directory' }
  const children = permissions.map((item) => ({ ...item, parentId: parent.id }))
  const current = { ...role, permissionIds: [parent.id, children[0].id] }
  const setRolePermissions = vi.fn(async () => undefined)
  const api = { listRoles: vi.fn(async () => [current]), listPermissions: vi.fn(async () => [parent, ...children]), setRolePermissions } as unknown as OperationsApi
  render(<RoleManagement api={api} can={() => true} notify={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: '配置 内容运营 的权限' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByRole('checkbox', { name: /发布短剧/ })).not.toBeChecked()
  fireEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(setRolePermissions).toHaveBeenLastCalledWith(role.id, current.permissionIds))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: '配置 内容运营 的权限' }))
  const group = within(screen.getByRole('dialog')).getByRole('checkbox', { name: /内容权限组/ })
  fireEvent.click(group)
  fireEvent.click(group)
  expect(within(screen.getByRole('dialog')).getByRole('checkbox', { name: /发布短剧/ })).toBeChecked()
})
