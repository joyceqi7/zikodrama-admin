import { safeErrorDetail } from '../../operationErrors'
import { Button, Tree, Empty, Flex, Form, Input, Select, Space, Table, Tag, Tooltip, Typography, type TableProps } from 'antd'
import { KeyRound, Pencil, Plus, RefreshCw, Shield, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { OperationsApi } from '../../api'
import { permissionCodes, type AdminPermission, type AdminRole, type AdminRoleInput, type AdminStatus } from '../../domain'
import { toUserMessage } from '../../userMessage'
import { ConfirmDialog, Modal } from '../../components/Modal'
import { PageHeader, PageStack, SectionHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'
import { permissionTree } from './permissionTree'

interface RoleManagementProps {
  // api 提供角色和权限树接口。
  api: OperationsApi
  // onPermissionsChanged 保存后刷新当前账号的有效操作和菜单。
  onPermissionsChanged?: () => Promise<void>
  // can 控制角色查看和各项维护入口。
  can: (permission: string) => boolean
  // notify 显示统一的保存结果与友好错误。
  notify: (message: string, tone?: 'success' | 'error') => void
}

type Dialog = { kind: 'create' } | { kind: 'edit' | 'permissions' | 'delete'; role: AdminRole }
const emptyRole: AdminRoleInput = { name: '', code: '', remark: '', status: 'active' }

// RoleManagement 通过权限树明确分配当前节点，新增子节点不会自动获得授权。
export function RoleManagement({ api, can, notify, onPermissionsChanged }: RoleManagementProps) {
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [permissions, setPermissions] = useState<AdminPermission[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [form, setForm] = useState(emptyRole)
  const [selected, setSelected] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [nextRoles, nextPermissions] = await Promise.all([api.listRoles(), can(permissionCodes.permissionRead) ? api.listPermissions() : Promise.resolve([])])
      setRoles(nextRoles)
      setPermissions(nextPermissions)
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setLoading(false)
    }
  }, [api, can, notify])

  useEffect(() => { void load() }, [load])

  const permissionNames = useMemo(() => new Map(permissions.map((permission) => [permission.id, permission.name])), [permissions])

  const openCreate = () => { setForm(emptyRole); setDialog({ kind: 'create' }) }
  const openEdit = (role: AdminRole) => { setForm({ name: role.name, code: role.code, remark: role.remark, status: role.status }); setDialog({ kind: 'edit', role }) }
  const openPermissions = (role: AdminRole) => { setSelected([...role.permissionIds]); setDialog({ kind: 'permissions', role }) }

  const submit = async () => {
    if (!dialog || (dialog.kind !== 'create' && dialog.kind !== 'edit')) return
    setBusy(true)
    try {
      if (dialog.kind === 'create') {
        await api.createRole(form)
        notify('角色已创建')
      } else {
        await api.updateRole(dialog.role.id, form)
        notify('角色已更新')
      }
      setDialog(null)
      await load()
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const savePermissions = async () => {
    if (!dialog || dialog.kind !== 'permissions') return
    setBusy(true)
    try {
      await api.setRolePermissions(dialog.role.id, selected)
      await onPermissionsChanged?.()
      notify('角色权限已更新')
      setDialog(null)
      await load()
    } catch (error) {
      const message = errorMessage(error)
      console.error('save admin role permissions failed', { roleId: dialog.role.id, error: safeErrorDetail(error) })
      notify(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!dialog || dialog.kind !== 'delete') return
    setBusy(true)
    try {
      await api.deleteRole(dialog.role.id)
      notify('角色已删除')
      setDialog(null)
      await load()
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const columns: TableProps<AdminRole>['columns'] = [
    { title: '角色', render: (_, role) => <Space><Shield size={16} /><Flex vertical><Typography.Text strong>{role.name}</Typography.Text><Typography.Text code>{role.code}</Typography.Text></Flex></Space> },
    {
      title: '权限',
      render: (_, role) => <Space wrap>{role.permissionIds.slice(0, 3).map((id) => <Tag key={id}>{permissionNames.get(id) ?? id}</Tag>)}{role.permissionIds.length > 3 && <Typography.Text type="secondary">+{role.permissionIds.length - 3}</Typography.Text>}{role.permissionIds.length === 0 && <Typography.Text type="secondary">未配置</Typography.Text>}</Space>,
    },
    { title: '状态', dataIndex: 'status', width: 110, render: (value: string) => <StatusBadge value={value} /> },
    { title: '备注', dataIndex: 'remark', ellipsis: true, render: (value: string) => value || '—' },
    {
      title: '操作',
      width: 150,
      fixed: 'right',
      render: (_, role) => <Space>
        {can(permissionCodes.roleAssign) && can(permissionCodes.permissionRead) && <Tooltip title="配置权限"><Button type="text" icon={<KeyRound size={16} />} onClick={() => openPermissions(role)} aria-label={`配置 ${role.name} 的权限`} /></Tooltip>}
        {can(permissionCodes.roleUpdate) && <Tooltip title="编辑"><Button type="text" icon={<Pencil size={16} />} onClick={() => openEdit(role)} aria-label={`编辑 ${role.name}`} /></Tooltip>}
        {can(permissionCodes.roleDelete) && <Tooltip title="删除"><Button type="text" danger icon={<Trash2 size={16} />} onClick={() => setDialog({ kind: 'delete', role })} aria-label={`删除 ${role.name}`} /></Tooltip>}
      </Space>,
    },
  ]

  return (
    <section aria-labelledby="roles-title">
      <PageStack>
        <PageHeader eyebrow="通过角色聚合权限，并将角色分配给用户。" title="角色管理" id="roles-title" />
        <SectionHeader
          title="角色列表"
          icon={<Shield size={17} />}
          actions={(
            <>
              <Button size="small" icon={<RefreshCw size={16} />} loading={loading} onClick={() => void load()}>刷新</Button>
              {can(permissionCodes.roleCreate) && <Button size="small" type="primary" icon={<Plus size={16} />} onClick={openCreate}>新建角色</Button>}
            </>
          )}
        />
        <Table size="small" rowKey="id" columns={columns} dataSource={roles} loading={loading} locale={{ emptyText: <Empty description="暂无角色" /> }} scroll={{ x: 760 }} />
      </PageStack>

      {dialog && (dialog.kind === 'create' || dialog.kind === 'edit') && (
        <Modal title={dialog.kind === 'create' ? '新建角色' : '编辑角色'} onClose={() => setDialog(null)}>
          <Form layout="vertical" onFinish={submit}>
            <Form.Item label="角色名称" htmlFor="role-name" required><Input id="role-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Form.Item>
            <Form.Item label="角色编码" htmlFor="role-code" required><Input id="role-code" pattern="[a-z][a-z0-9_.-]+" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></Form.Item>
            <Form.Item label="备注" htmlFor="role-remark"><Input.TextArea id="role-remark" rows={3} value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} /></Form.Item>
            <StatusSelect value={form.status} onChange={(status) => setForm({ ...form, status })} />
            <Flex justify="flex-end" gap="small"><Button onClick={() => setDialog(null)}>取消</Button><Button type="primary" htmlType="submit" loading={busy}>保存</Button></Flex>
          </Form>
        </Modal>
      )}

      {dialog?.kind === 'permissions' && (
        <Modal title={`配置权限 · ${dialog.role.name}`} width="wide" onClose={() => setDialog(null)}>
          <PageStack>
            <Typography.Text type="secondary">菜单控制导航，操作权限控制业务接口。勾选节点会选择当前子树；之后新增的子节点不会自动授权。</Typography.Text>
            {permissions.length > 0 ? (
              <Tree checkable checkStrictly defaultExpandAll height={320} virtual={false} aria-label="角色权限树" checkedKeys={selected}
                treeData={permissionTree(permissions).map(function convert(node): {key: string; title: React.ReactNode; children?: ReturnType<typeof convert>[]} {
                  return { key: node.id, title: <Space wrap><Typography.Text>{node.name}</Typography.Text><Tag>{node.type === 'directory' ? '目录' : node.type === 'menu' ? '页面' : '操作'}</Tag>{node.status === 'disabled' && <Tag>停用</Tag>}<Typography.Text code>{node.code}</Typography.Text></Space>, children: node.children?.map(convert) }
                })}
                onCheck={(_, info) => {
                  // 只在用户实际勾选时展开当前子树；重新打开不会选中后来新增的节点。
                  const ids = new Set([String(info.node.key)])
                  let changed = true
                  while (changed) { changed = false; for (const node of permissions) if (ids.has(node.parentId) && !ids.has(node.id)) { ids.add(node.id); changed = true } }
                  setSelected((current) => info.checked ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.has(id)))
                }}
              />
            ) : <Empty description="暂无可分配的系统权限" />}
            <Flex justify="flex-end" gap="small"><Button onClick={() => setDialog(null)}>取消</Button><Button type="primary" loading={busy} onClick={savePermissions}>保存</Button></Flex>
          </PageStack>
        </Modal>
      )}
      {dialog?.kind === 'delete' && <ConfirmDialog title="删除角色" message={`确认删除角色“${dialog.role.name}”？仍被用户使用的角色无法删除。`} busy={busy} onClose={() => setDialog(null)} onConfirm={remove} />}
    </section>
  )
}

function StatusSelect({ value, onChange }: { value: AdminStatus; onChange: (value: AdminStatus) => void }) {
  return <Form.Item label="状态"><Select value={value} options={[{ value: 'active', label: '启用' }, { value: 'disabled', label: '停用' }]} onChange={onChange} /></Form.Item>
}

function errorMessage(error: unknown): string {
  return toUserMessage(error)
}
