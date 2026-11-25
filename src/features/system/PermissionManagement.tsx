import { safeErrorDetail } from '../../operationErrors'
import { Alert, Button, Empty, Flex, Form, Input, InputNumber, Select, Space, Table, Tag, Tooltip, TreeSelect, Typography, type TableProps } from 'antd'
import { CircleDashed, KeyRound, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { OperationsApi } from '../../api'
import { permissionCodes, type AdminPermission, type AdminPermissionInput, type AdminPermissionType } from '../../domain'
import { toUserMessage } from '../../userMessage'
import { PageHeader, PageStack, SectionHeader } from '../../components/PageHeader'
import { ConfirmDialog, Modal } from '../../components/Modal'
import { descendantPermissionIDs, permissionTree, type PermissionTreeNode } from './permissionTree'
import { canonicalMenuPath } from '../../app/routes'
import { navigationIconOptions } from '../../app/navigation'

interface PermissionManagementProps {
  // api 提供权限树读取和增删改接口。
  api: OperationsApi
  // can 控制独立操作入口，服务端仍执行同一权限校验。
  can: (permission: string) => boolean
  // onChanged 在保存后刷新当前会话，使菜单名称、排序与授权及时更新。
  onChanged?: () => Promise<void>
}

const emptyPermission: AdminPermissionInput = { parentId: '', name: '', code: '', type: 'directory', route: '', icon: '', sortOrder: 0, status: 'active', remark: '' }
const typeLabels = { directory: '目录', menu: '页面', action: '操作' }
type Editor = { id?: string; input: AdminPermissionInput }
interface ParentOption { value: string; title: string; disabled: boolean; children: ParentOption[] }

// PermissionManagement 维护可自定义的权限树，并通过父节点选择支持移动。
export function PermissionManagement({ api, can, onChanged }: PermissionManagementProps) {
  const [permissions, setPermissions] = useState<AdminPermission[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [editorError, setEditorError] = useState('')
  const [deleting, setDeleting] = useState<AdminPermission | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setPermissions(await api.listPermissions()) }
    catch (cause) { setError(reportFailure('读取权限树', cause)) }
    finally { setLoading(false) }
  }, [api])
  useEffect(() => { void load() }, [load])
  const tree = useMemo(() => permissionTree(permissions), [permissions])

  const openCreate = (parent?: AdminPermission) => {
    setEditorError('')
    setEditor({ input: { ...emptyPermission, parentId: parent?.id || '', type: parent?.type === 'menu' ? 'action' : parent ? 'menu' : 'directory' } })
  }
  const edit = (item: AdminPermission) => {
    setEditorError('')
    const { parentId, name, code, type, route, icon = '', sortOrder, status, remark } = item
    setEditor({ id: item.id, input: { parentId, name, code, type, route: canonicalMenuPath(route), icon, sortOrder, status, remark } })
  }
  const updateForm = (patch: Partial<AdminPermissionInput>) => setEditor((current) => current && ({ ...current, input: { ...current.input, ...patch } }))
  const save = async () => {
    if (!editor || !can(editor.id ? permissionCodes.permissionUpdate : permissionCodes.permissionCreate)) return
    setBusy(true); setEditorError('')
    try {
      if (editor.id) await api.updatePermission(editor.id, editor.input)
      else await api.createPermission(editor.input)
      setEditor(null)
      await load()
      await onChanged?.()
    } catch (cause) { setEditorError(reportFailure('保存权限节点', cause)); setError(toUserMessage(cause)) }
    finally { setBusy(false) }
  }
  const remove = async () => {
    if (!deleting || !can(permissionCodes.permissionDelete)) return
    setBusy(true)
    try { await api.deletePermission(deleting.id); setDeleting(null); await load(); await onChanged?.() }
    catch (cause) { setError(reportFailure('删除权限节点', cause)); setDeleting(null) }
    finally { setBusy(false) }
  }
  const parentOptions = useMemo(() => {
    const excluded = descendantPermissionIDs(permissions, editor?.id || '')
    const walk = (nodes: PermissionTreeNode[]): ParentOption[] => nodes.filter((node) => node.type !== 'action' && !excluded.has(node.id)).map((node) => ({ value: node.id, title: node.name, disabled: node.type === 'menu' && editor?.input.type !== 'action', children: walk(node.children || []) }))
    return walk(tree)
  }, [permissions, tree, editor?.id, editor?.input.type])
  const columns: TableProps<PermissionTreeNode>['columns'] = [
    { title: '权限名称', dataIndex: 'name', width: 230 },
    { title: '类型', dataIndex: 'type', width: 80, render: (type: AdminPermissionType) => <Tag>{typeLabels[type]}</Tag> },
    { title: '权限码', dataIndex: 'code', render: (code: string) => <Typography.Text code>{code}</Typography.Text> },
    { title: '页面路径', dataIndex: 'route', render: (route: string) => route ? <Typography.Text code>{canonicalMenuPath(route)}</Typography.Text> : '—' },
    { title: '图标', dataIndex: 'icon', width: 72, align: 'center', render: (icon?: string) => {
      const option = navigationIconOptions.find((item) => item.value === icon)
      if (!option) return '—'
      const Icon = option.icon
      return <Tooltip title={option.label}><span role="img" aria-label={`${option.label}图标`}><Icon size={18} /></span></Tooltip>
    } },
    { title: '排序', dataIndex: 'sortOrder', width: 65 },
    { title: '状态', dataIndex: 'status', width: 80, render: (status: string) => <Tag color={status === 'active' ? 'green' : 'default'}>{status === 'active' ? '启用' : '停用'}</Tag> },
    { title: '操作', width: 130, fixed: 'right', render: (_, item) => <Space size="small">
      {can(permissionCodes.permissionCreate) && item.type !== 'action' && <Button type="text" icon={<Plus size={16} />} aria-label={`在 ${item.name} 下新增权限`} onClick={() => openCreate(item)} />}
      {can(permissionCodes.permissionUpdate) && <Button type="text" icon={<Pencil size={16} />} aria-label={`编辑 ${item.name}`} onClick={() => edit(item)} />}
      {can(permissionCodes.permissionDelete) && <Button type="text" danger icon={<Trash2 size={16} />} aria-label={`删除 ${item.name}`} onClick={() => setDeleting(item)} />}
    </Space> },
  ]

  return <section aria-labelledby="permissions-title" aria-busy={loading}>
    <PageStack>
      <PageHeader eyebrow="维护目录、页面和操作权限，再通过角色授予成员。" title="权限管理" id="permissions-title" />
      <SectionHeader title="权限树" icon={<KeyRound size={17} />} actions={<>
        <Button size="small" icon={<RefreshCw size={16} />} loading={loading} onClick={() => void load()}>刷新</Button>
        {can(permissionCodes.permissionCreate) && <Button size="small" type="primary" icon={<Plus size={16} />} onClick={() => openCreate()}>新增权限</Button>}
      </>} />
      {error && <Alert type="error" showIcon title={error} role="alert" />}
      <Table size="small" rowKey="id" columns={columns} dataSource={tree} loading={loading} pagination={false} expandable={{ defaultExpandAllRows: true }} locale={{ emptyText: <Empty description="暂无权限节点" /> }} scroll={{ x: 1080 }} />
    </PageStack>
    {editor && <Modal title={editor.id ? '编辑权限' : '新增权限'} onClose={() => { if (!busy) setEditor(null) }}>
      <Form layout="vertical" onFinish={() => void save()}>
        {editorError && <Alert type="error" title={editorError} showIcon role="alert" />}
        <Form.Item label="节点类型" htmlFor="permission-type"><Select id="permission-type" value={editor.input.type} options={Object.entries(typeLabels).map(([value, label]) => ({ value, label }))} onChange={(type) => updateForm({ type, route: '', icon: type === 'action' ? '' : editor.input.icon, parentId: '' })} /></Form.Item>
        <Form.Item label="上级节点" htmlFor="permission-parent"><TreeSelect id="permission-parent" allowClear placeholder="根节点" treeDefaultExpandAll value={editor.input.parentId || undefined} treeData={parentOptions} onChange={(parentId) => updateForm({ parentId: parentId || '' })} /></Form.Item>
        <Form.Item label="权限名称" htmlFor="permission-name" required><Input id="permission-name" required maxLength={100} value={editor.input.name} onChange={(event) => updateForm({ name: event.target.value })} /></Form.Item>
        <Form.Item label="权限编码" htmlFor="permission-code" required extra={editor.input.type === 'action' ? '操作编码需与业务接口对应，例如 content.drama.read；修改编码会改变授权效果。' : undefined}><Input id="permission-code" required pattern="[a-z][a-z0-9_.-]{1,127}" maxLength={128} value={editor.input.code} onChange={(event) => updateForm({ code: event.target.value })} /></Form.Item>
        {editor.input.type === 'menu' && <Form.Item label="页面路径" htmlFor="permission-route" required extra="填写已实现的站内路径，例如 /channels/postback-logs。"><Input id="permission-route" required maxLength={200} placeholder="/channels/postback-logs" value={editor.input.route} onChange={(event) => updateForm({ route: event.target.value })} /></Form.Item>}
        {editor.input.type !== 'action' && <Form.Item label="导航图标" extra="图标与名称相互独立；不选择时使用页面默认图标。">
          <Flex wrap gap={8} role="group" aria-label="导航图标">
            <Tooltip title="默认图标"><Button type={editor.input.icon ? 'default' : 'primary'} icon={<CircleDashed size={18} />} aria-label="使用默认图标" aria-pressed={!editor.input.icon} onClick={() => updateForm({ icon: '' })} /></Tooltip>
            {navigationIconOptions.map(({ value, label, icon: Icon }) => <Tooltip key={value} title={label}><Button type={editor.input.icon === value ? 'primary' : 'default'} icon={<Icon size={18} />} aria-label={`选择${label}图标`} aria-pressed={editor.input.icon === value} onClick={() => updateForm({ icon: value })} /></Tooltip>)}
          </Flex>
        </Form.Item>}
        <Form.Item label="同级排序" htmlFor="permission-order"><InputNumber id="permission-order" min={0} max={100000} precision={0} value={editor.input.sortOrder} onChange={(sortOrder) => updateForm({ sortOrder: sortOrder || 0 })} /></Form.Item>
        <Form.Item label="状态" htmlFor="permission-status" extra="停用节点后，其下所有权限也会失效。"><Select id="permission-status" value={editor.input.status} options={[{ value: 'active', label: '启用' }, { value: 'disabled', label: '停用' }]} onChange={(status) => updateForm({ status })} /></Form.Item>
        <Form.Item label="备注" htmlFor="permission-remark"><Input.TextArea id="permission-remark" maxLength={500} value={editor.input.remark} onChange={(event) => updateForm({ remark: event.target.value })} /></Form.Item>
        <Flex justify="flex-end" gap="small"><Button disabled={busy} onClick={() => setEditor(null)}>取消</Button><Button type="primary" htmlType="submit" loading={busy}>保存</Button></Flex>
      </Form>
    </Modal>}
    {deleting && <ConfirmDialog title="删除权限" message={`确认删除“${deleting.name}”？存在子节点或已分配给角色的权限无法删除。`} busy={busy} onClose={() => { if (!busy) setDeleting(null) }} onConfirm={() => void remove()} />}
  </section>
}

function reportFailure(operation: string, cause: unknown): string {
  const error = toUserMessage(cause)
  console.error('admin permission operation failed', { operation, error: safeErrorDetail(cause) })
  return error
}
