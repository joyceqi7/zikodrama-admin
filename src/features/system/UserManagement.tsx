import { Avatar, Button, Checkbox, Empty, Flex, Form, Input, Select, Space, Table, Tag, Tooltip, Typography, type TableProps } from 'antd'
import { KeyRound, Pencil, Plus, RefreshCw, ShieldCheck, UserCog } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { OperationsApi } from '../../api'
import { permissionCodes, type AdminRole, type AdminStatus, type AdminUser, type AdminUserCreateInput } from '../../domain'
import { toUserMessage } from '../../userMessage'
import { Modal } from '../../components/Modal'
import { PageHeader, PageStack, SectionHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'

interface UserManagementProps {
  api: OperationsApi
  can: (permission: string) => boolean
  notify: (message: string, tone?: 'success' | 'error') => void
  currentUserId: string
  onSessionInvalidated: () => void
}

type Dialog = { kind: 'create' } | { kind: 'edit'; user: AdminUser } | { kind: 'roles'; user: AdminUser } | { kind: 'password'; user: AdminUser }

const emptyUser: AdminUserCreateInput = { username: '', password: '', nickname: '', status: 'active' }

export function UserManagement({ api, can, notify, currentUserId, onSessionInvalidated }: UserManagementProps) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [userForm, setUserForm] = useState(emptyUser)
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [password, setPassword] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [nextUsers, nextRoles] = await Promise.all([api.listUsers(), can(permissionCodes.roleRead) ? api.listRoles() : Promise.resolve([])])
      setUsers(nextUsers)
      setRoles(nextRoles)
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setLoading(false)
    }
  }, [api, can, notify])

  useEffect(() => { void load() }, [load])

  const roleNames = useMemo(() => new Map(roles.map((role) => [role.id, role.name])), [roles])

  const openCreate = () => {
    setUserForm(emptyUser)
    setDialog({ kind: 'create' })
  }

  const openEdit = (user: AdminUser) => {
    setUserForm({ username: user.username, password: '', nickname: user.nickname, status: user.status })
    setDialog({ kind: 'edit', user })
  }

  const openRoles = (user: AdminUser) => {
    setSelectedRoles([...user.roleIds])
    setDialog({ kind: 'roles', user })
  }

  const openPassword = (user: AdminUser) => {
    setPassword('')
    setDialog({ kind: 'password', user })
  }

  const submitUser = async () => {
    if (!dialog || (dialog.kind !== 'create' && dialog.kind !== 'edit')) return
    setBusy(true)
    try {
      if (dialog.kind === 'create') {
        await api.createUser(userForm)
        notify('用户已创建')
      } else {
        await api.updateUser(dialog.user.id, { nickname: userForm.nickname, status: userForm.status })
        notify('用户已更新')
        if (dialog.user.id === currentUserId && dialog.user.status !== userForm.status) {
          onSessionInvalidated()
          return
        }
      }
      setDialog(null)
      await load()
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const saveRoles = async () => {
    if (!dialog || dialog.kind !== 'roles') return
    setBusy(true)
    try {
      await api.setUserRoles(dialog.user.id, selectedRoles)
      notify('用户角色已更新')
      setDialog(null)
      await load()
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const savePassword = async () => {
    if (!dialog || dialog.kind !== 'password') return
    setBusy(true)
    try {
      await api.resetUserPassword(dialog.user.id, password)
      notify('密码已重置')
      if (dialog.user.id === currentUserId) {
        onSessionInvalidated()
        return
      }
      setDialog(null)
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const columns: TableProps<AdminUser>['columns'] = [
    {
      title: '用户',
      render: (_, user) => (
        <Space>
          <Avatar icon={<UserCog size={16} />} />
          <Flex vertical>
            <Typography.Text strong>{user.nickname}</Typography.Text>
            <Typography.Text type="secondary">{user.username}{user.isSuper ? ' · 超级管理员' : ''}</Typography.Text>
          </Flex>
        </Space>
      ),
    },
    {
      title: '角色',
      render: (_, user) => (
        <Space wrap>
          {user.isSuper ? <Tag>全部权限</Tag> : user.roleIds.length > 0 ? user.roleIds.map((id) => <Tag key={id}>{roleNames.get(id) ?? id}</Tag>) : <Typography.Text type="secondary">未分配</Typography.Text>}
        </Space>
      ),
    },
    { title: '状态', dataIndex: 'status', width: 110, render: (value: string) => <StatusBadge value={value} /> },
    { title: '创建时间', dataIndex: 'createdAt', width: 130, render: formatDate },
    {
      title: '操作',
      width: 150,
      render: (_, user) => (
        <Space>
          {can(permissionCodes.userAssignRole) && can(permissionCodes.roleRead) && !user.isSuper && <Tooltip title="分配角色"><Button type="text" icon={<ShieldCheck size={16} />} onClick={() => openRoles(user)} aria-label={`分配 ${user.username} 的角色`} /></Tooltip>}
          {can(permissionCodes.userReset) && <Tooltip title="重置密码"><Button type="text" icon={<KeyRound size={16} />} onClick={() => openPassword(user)} aria-label={`重置 ${user.username} 的密码`} /></Tooltip>}
          {can(permissionCodes.userUpdate) && <Tooltip title="编辑"><Button type="text" icon={<Pencil size={16} />} onClick={() => openEdit(user)} aria-label={`编辑 ${user.username}`} /></Tooltip>}
        </Space>
      ),
    },
  ]

  return (
    <section aria-labelledby="users-title">
      <PageStack>
        <PageHeader eyebrow="管理系统账号、状态、密码和角色分配。" title="用户管理" id="users-title" />
        <SectionHeader
          title="账号列表"
          icon={<UserCog size={17} />}
          actions={(
            <>
              <Button size="small" icon={<RefreshCw size={16} />} loading={loading} onClick={() => void load()}>刷新</Button>
              {can(permissionCodes.userCreate) && <Button size="small" type="primary" icon={<Plus size={16} />} onClick={openCreate}>新建用户</Button>}
            </>
          )}
        />
        <Table size="small" rowKey="id" columns={columns} dataSource={users} loading={loading} locale={{ emptyText: <Empty description="暂无用户" /> }} scroll={{ x: 780 }} />
      </PageStack>

      {dialog && (dialog.kind === 'create' || dialog.kind === 'edit') && (
        <Modal title={dialog.kind === 'create' ? '新建用户' : '编辑用户'} onClose={() => setDialog(null)}>
          <Form layout="vertical" onFinish={submitUser}>
            <Form.Item label="用户名" htmlFor="user-username" required>
              <Input id="user-username" minLength={3} disabled={dialog.kind === 'edit'} value={userForm.username} onChange={(event) => setUserForm({ ...userForm, username: event.target.value })} />
            </Form.Item>
            <Form.Item label="昵称" htmlFor="user-nickname" required>
              <Input id="user-nickname" value={userForm.nickname} onChange={(event) => setUserForm({ ...userForm, nickname: event.target.value })} />
            </Form.Item>
            {dialog.kind === 'create' && <Form.Item label="初始密码" htmlFor="user-password" required><Input.Password id="user-password" minLength={12} maxLength={72} autoComplete="new-password" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} /></Form.Item>}
            <StatusSelect value={userForm.status} onChange={(status) => setUserForm({ ...userForm, status })} />
            <Flex justify="flex-end" gap="small"><Button onClick={() => setDialog(null)}>取消</Button><Button type="primary" htmlType="submit" loading={busy}>保存</Button></Flex>
          </Form>
        </Modal>
      )}

      {dialog?.kind === 'roles' && (
        <Modal title={`分配角色 · ${dialog.user.username}`} onClose={() => setDialog(null)}>
          <PageStack>
            <Checkbox.Group value={selectedRoles} onChange={(values) => setSelectedRoles(values as string[])}>
              <Flex vertical gap="small">
                {roles.map((role) => <Checkbox value={role.id} key={role.id}><Typography.Text strong>{role.name}</Typography.Text> <Typography.Text type="secondary">{role.code}{role.status === 'disabled' ? ' · 已停用' : ''}</Typography.Text></Checkbox>)}
              </Flex>
            </Checkbox.Group>
            {roles.length === 0 && <Empty description="没有可分配角色，或当前账号无角色查看权限" />}
            <Flex justify="flex-end" gap="small"><Button onClick={() => setDialog(null)}>取消</Button><Button type="primary" loading={busy} onClick={saveRoles}>保存</Button></Flex>
          </PageStack>
        </Modal>
      )}

      {dialog?.kind === 'password' && (
        <Modal title={`重置密码 · ${dialog.user.username}`} onClose={() => setDialog(null)}>
          <Form layout="vertical" onFinish={savePassword}>
            <Form.Item label="新密码" htmlFor="reset-password" required><Input.Password id="reset-password" minLength={12} maxLength={72} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus /></Form.Item>
            <Flex justify="flex-end" gap="small"><Button onClick={() => setDialog(null)}>取消</Button><Button type="primary" htmlType="submit" loading={busy}>重置密码</Button></Flex>
          </Form>
        </Modal>
      )}
    </section>
  )
}

function StatusSelect({ value, onChange }: { value: AdminStatus; onChange: (value: AdminStatus) => void }) {
  return <Form.Item label="状态"><Select value={value} options={[{ value: 'active', label: '启用' }, { value: 'disabled', label: '停用' }]} onChange={onChange} /></Form.Item>
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleDateString('zh-CN')
}

function errorMessage(error: unknown): string {
  return toUserMessage(error)
}
