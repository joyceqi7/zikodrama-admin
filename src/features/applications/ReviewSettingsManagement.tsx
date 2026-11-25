import { Alert, Button, Empty, Flex, Form, Input, Modal, Switch, Table, Tag } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { OperationsApi } from '../../api'
import type { MiniReviewSettings, MiniReviewVersion } from '../../applications'
import { PageHeader, PageStack } from '../../components/PageHeader'
import { reportOperationFailure } from '../../operationErrors'

interface Props {
  /** applicationId 固定当前页面的读取、保存和并发修订归属。 */
  applicationId: string
  /** api 仅使用独立审核开关接口。 */
  api: OperationsApi
  /** canUpdate 控制版本和开关编辑，查看权限不授予保存能力。 */
  canUpdate: boolean
  /** notify 使用统一安全提示。 */
  notify(message: string, tone?: 'success' | 'error'): void
  /** onEditingStateChange 防止切换应用和离开页面时丢失修改。 */
  onEditingStateChange?(dirty: boolean, saving: boolean): void
}

function versionsOf(config: MiniReviewSettings): MiniReviewVersion[] {
  return config.versions ?? (config.version ? [{ version: config.version, enabled: !!config.enabled }] : [])
}

/** ReviewSettingsManagement 展示应用的多版本审核配置，新增和编辑均在弹窗完成。 */
export function ReviewSettingsManagement({ applicationId, api, canUpdate, notify, onEditingStateChange }: Props) {
  const [config, setConfig] = useState<MiniReviewSettings>()
  const [editing, setEditing] = useState<MiniReviewVersion | null | undefined>()
  const [version, setVersion] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [action, setAction] = useState<{ kind: 'close' | 'delete'; version: string }>()
  const generation = useRef<symbol>(Symbol())
  const rows = config ? versionsOf(config) : []
  const open = editing !== undefined
  const dirty = open && (version !== (editing?.version ?? '') || enabled !== (editing?.enabled ?? false))
  const validVersion = version.trim().length <= 32 && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version.trim())
  const duplicate = !editing && rows.some(row => row.version === version.trim())
  const load = useCallback(async () => {
    const ticket = Symbol()
    generation.current = ticket
    setConfig(undefined); setFailed(false); setEditing(undefined); setAction(undefined); setSaving(false)
    if (!applicationId) return
    setLoading(true)
    try {
      const value = await api.getReviewSettings(applicationId)
      if (ticket !== generation.current) return
      setConfig(value)
    } catch (error) {
      if (ticket === generation.current) { setFailed(true); notify(reportOperationFailure('load review settings failed', error), 'error') }
    } finally { if (ticket === generation.current) setLoading(false) }
  }, [api, applicationId, notify])
  useEffect(() => { void load(); return () => { generation.current = Symbol() } }, [load])
  useEffect(() => { onEditingStateChange?.(dirty, saving) }, [dirty, saving, onEditingStateChange])
  useEffect(() => () => onEditingStateChange?.(false, false), [onEditingStateChange])
  useEffect(() => {
    if (!dirty && !saving) return
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty, saving])
  const edit = (row: MiniReviewVersion | null) => {
    setVersion(row?.version ?? ''); setEnabled(row?.enabled ?? false); setEditing(row)
  }
  // 编辑、关闭和删除共用修订校验，只提交版本列表，不回写清单或应用资料。
  const saveVersions = async (versions: MiniReviewVersion[], message: string): Promise<boolean> => {
    if (!config || !canUpdate || saving || loading) return false
    const ticket = generation.current
    setSaving(true)
    try {
      const value = await api.saveReviewSettings(applicationId, { versions, revision: config.revision })
      if (ticket !== generation.current) return false
      setConfig(value); notify(message, 'success')
      return true
    } catch (error) {
      if (ticket === generation.current) notify(reportOperationFailure('save review settings failed', error), 'error')
      return false
    } finally { if (ticket === generation.current) setSaving(false) }
  }
  const save = async () => {
    if (!dirty || !validVersion || duplicate) return
    const next = { version: version.trim(), enabled }
    const versions = editing ? rows.map(row => row.version === editing.version ? next : row) : [...rows, next]
    if (await saveVersions(versions, editing ? '审核开关已保存' : '发布版本已添加')) setEditing(undefined)
  }
  const confirmAction = async () => {
    if (!action || !rows.some(row => row.version === action.version)) return
    const versions = action.kind === 'delete'
      ? rows.filter(row => row.version !== action.version)
      : rows.map(row => row.version === action.version ? { ...row, enabled: false } : row)
    if (await saveVersions(versions, action.kind === 'delete' ? '审核版本已删除' : '审核版本已关闭')) setAction(undefined)
  }
  if (!applicationId) return <Empty description="请先选择应用" />
  const versionError = duplicate ? '该版本已存在，请在列表中编辑' : version && !validVersion ? '请输入三段版本号，例如 1.0.1' : undefined
  return <section aria-label="审核开关"><PageStack>
    <PageHeader id="review-settings-title" title="审核开关" eyebrow="按应用和版本独立生效，多个版本可同时开启。" divider={false} actions={<>
      <Button disabled={saving || open || !!action} loading={loading} onClick={() => void load()}>重新加载</Button>
      {canUpdate && <Button type="primary" disabled={!config || loading || saving || !!action || rows.length >= 100} onClick={() => edit(null)}>新增发布</Button>}
    </>} />
    <Alert type="info" showIcon title="命中版本后使用当前主体对应发布渠道的审核列表。" description="在「直连发布 / 官方发布 → 审核列表」维护内容。开启且版本命中时，首页仅展示审核列表；分类、轮播、热播和普通短剧列表全部隐藏。关闭后恢复正常首页。" />
    {failed && <Alert type="error" showIcon title="审核设置读取失败，请重新加载。" />}
    <Table<MiniReviewVersion> rowKey="version" loading={loading} dataSource={rows} pagination={false} tableLayout="fixed" locale={{ emptyText: failed ? '请重新加载审核版本' : '暂无发布版本，点击「新增发布」手动填写版本号' }} columns={[
      { title: '版本号', dataIndex: 'version', ellipsis: true },
      { title: '审核开关', dataIndex: 'enabled', width: 84, render: (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? '开启' : '关闭'}</Tag> },
      ...(canUpdate ? [{ title: '操作', key: 'actions', width: 160, render: (_: unknown, row: MiniReviewVersion) => <Flex gap={0} wrap={false}>
        <Button type="link" size="small" disabled={saving || loading || open || !!action} aria-label={`编辑版本 ${row.version}`} onClick={() => edit(row)}>编辑</Button>
        <Button type="link" size="small" disabled={!row.enabled || saving || loading || open || !!action} aria-label={`关闭版本 ${row.version}`} onClick={() => setAction({ kind: 'close', version: row.version })}>关闭</Button>
        <Button type="link" size="small" danger disabled={saving || loading || open || !!action} aria-label={`删除版本 ${row.version}`} onClick={() => setAction({ kind: 'delete', version: row.version })}>删除</Button>
      </Flex> }] : []),
    ]} />
    <Modal title={action?.kind === 'delete' ? '删除审核版本' : '关闭审核版本'} open={!!action}
      onCancel={() => { if (!saving) setAction(undefined) }} onOk={() => void confirmAction()}
      okText={action?.kind === 'delete' ? '删除' : '关闭'} cancelText="取消" confirmLoading={saving}
      closable={!saving} keyboard={!saving} mask={{ closable: !saving }} cancelButtonProps={{ disabled: saving }}
      okButtonProps={{ danger: action?.kind === 'delete', disabled: !config || loading || !canUpdate }}>
      <p>{action?.kind === 'delete' ? `确认删除版本 ${action.version} 的审核配置？` : `确认关闭版本 ${action?.version} 的审核开关？`}</p>
      <p>操作后，此版本按应用的正常内容和解锁策略运行。</p>
    </Modal>
    <Modal title={editing ? '编辑发布版本' : '新增发布'} open={open} onCancel={() => setEditing(undefined)} onOk={() => void save()} okText={editing ? '保存' : '新增发布'} cancelText="取消" confirmLoading={saving} closable={!saving} keyboard={!saving} mask={{ closable: !dirty && !saving }} cancelButtonProps={{ disabled: saving }} okButtonProps={{ disabled: !config || !dirty || !validVersion || duplicate || loading || !canUpdate }}>
      <Form layout="vertical" disabled={!canUpdate || saving}>
        <Form.Item label="版本号" htmlFor="review-settings-version" extra="手动填写 Mini 包版本，例如 1.0.1。" validateStatus={versionError ? 'error' : undefined} help={versionError}>
          <Input id="review-settings-version" maxLength={32} disabled={!!editing} value={version} onChange={event => setVersion(event.target.value)} placeholder="例如 1.0.1" />
        </Form.Item>
        <Form.Item label="审核开关" htmlFor="review-settings-enabled"><Switch id="review-settings-enabled" aria-label="审核开关" checked={enabled} onChange={setEnabled} checkedChildren="开启" unCheckedChildren="关闭" /></Form.Item>
        <p>同主体同发布渠道的应用共用审核列表。</p>
      </Form>
    </Modal>
  </PageStack></section>
}
