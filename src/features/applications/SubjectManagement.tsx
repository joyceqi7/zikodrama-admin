import { useEffect, useState } from 'react'
import { Button, Drawer, Empty, Flex, Form, Input, Table, Tag, Typography } from 'antd'
import { Plus, RefreshCw } from 'lucide-react'
import type { OperationsApi } from '../../api'
import type { Subject, SubjectInput } from '../../subjects'
import { PageHeader, PageStack } from '../../components/PageHeader'
import { reportOperationFailure } from '../../operationErrors'

interface Props {
  /** api 提供主体维护接口。 */
  api: OperationsApi
  /** canCreate 只控制新增操作，不按主体分配权限。 */
  canCreate: boolean
  /** canUpdate 控制主体资料与发布密钥维护。 */
  canUpdate: boolean
  /** onChanged 保存后刷新顶部主体和应用选项。 */
  onChanged(): Promise<void>
  /** notify 输出统一安全提示。 */
  notify(message: string, tone?: 'success' | 'error'): void
}

/** SubjectManagement 管理主体独立的短剧和 TikTok 发布身份，VOD 空间由全局媒资配置统一维护。 */
export function SubjectManagement({ api, canCreate, canUpdate, onChanged, notify }: Props) {
  const [rows, setRows] = useState<Subject[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<Subject | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<SubjectInput>()
  useEffect(() => {
    let active = true
    setLoading(true)
    api.listSubjects().then(next => { if (active) setRows(next) }).catch(error => {
      if (active) notify(reportOperationFailure('加载主体列表失败', error), 'error')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, notify])
  const refresh = async () => {
    setLoading(true)
    try { setRows(await api.listSubjects()) }
    catch (error) { notify(reportOperationFailure('刷新主体列表失败', error), 'error') }
    finally { setLoading(false) }
  }
  const open = (row: Subject | 'new') => {
    form.resetFields()
    form.setFieldsValue(row === 'new' ? { name: '', remark: '', tiktokAppId: '', clientKey: '' } : { name: row.name, remark: row.remark, tiktokAppId: row.tiktokAppId, clientKey: row.clientKey })
    setEditing(row)
  }
  const close = () => { if (!saving) { setEditing(null); form.resetFields() } }
  const save = async (input: SubjectInput) => {
    if (!editing || (editing === 'new' ? !canCreate : !canUpdate)) return
    setSaving(true)
    try {
      const saved = editing === 'new' ? await api.createSubject(input) : await api.updateSubject(editing.id, input)
      setRows(current => current.some(row => row.id === saved.id) ? current.map(row => row.id === saved.id ? saved : row) : [...current, saved])
      setEditing(null); form.resetFields()
      notify('主体已保存')
      // 资料已经保存；选项刷新失败不能伪装成保存失败或诱发重复创建。
      try { await onChanged() } catch (error) { notify(reportOperationFailure('刷新主体选择项失败', error), 'error') }
    } catch (error) { notify(reportOperationFailure('保存主体失败', error), 'error') }
    finally { setSaving(false) }
  }
  return <section aria-labelledby="subject-management-title"><PageStack>
    <PageHeader id="subject-management-title" title="主体管理" eyebrow="各主体独立维护短剧和 TikTok 发布方，共用全局 VOD 空间。" actions={<><Button icon={<RefreshCw size={15} />} loading={loading} onClick={() => void refresh()}>刷新</Button>{canCreate && <Button type="primary" icon={<Plus size={15} />} onClick={() => open('new')}>新建主体</Button>}</>} />
    <Table rowKey="id" loading={loading} dataSource={rows} scroll={{ x: 720 }} pagination={false} locale={{ emptyText: <Empty description="暂无主体" /> }} columns={[
      { title: '主体', dataIndex: 'name', render: (name, row) => <Flex vertical gap={4}><Typography.Text strong>{name}</Typography.Text><Typography.Text type="secondary">{row.remark || '—'}</Typography.Text></Flex> },
      { title: '发布方 App ID', dataIndex: 'tiktokAppId', render: value => value || '未配置' },
      { title: 'Client Key', dataIndex: 'clientKey', render: value => value || '未配置' },
      { title: '发布密钥', dataIndex: 'clientSecretConfigured', render: value => <Tag color={value ? 'success' : undefined}>{value ? '已配置' : '未配置'}</Tag> },
      { title: '操作', key: 'actions', render: (_, row) => <Button disabled={!canUpdate} onClick={() => open(row)} aria-label={`编辑主体 ${row.name}`}>编辑</Button> },
    ]} />
    <Drawer title={editing === 'new' ? '新建主体' : '编辑主体'} open={editing !== null} onClose={close} size="large" extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>保存</Button>}>
      <Form form={form} layout="vertical" onFinish={values => void save(values)} disabled={saving}>
        <Form.Item label="主体名称" name="name" rules={[{ required: true, whitespace: true, message: '请输入主体名称' }, { max: 128 }]}><Input maxLength={128} /></Form.Item>
        <Form.Item label="备注" name="remark" rules={[{ max: 500 }]}><Input.TextArea maxLength={500} rows={3} /></Form.Item>
        <Typography.Paragraph type="secondary">仅 TikTok 官方发布需要配置发布方；留空不会影响所属应用的独立播放器。</Typography.Paragraph>
        <Form.Item label="发布方 TikTok App ID" name="tiktokAppId" rules={[{ pattern: /^[0-9]{1,64}$/, message: '请输入数字字符串 App ID' }]}><Input maxLength={64} /></Form.Item>
        <Form.Item label="发布方 Client Key" name="clientKey" rules={[{ max: 255 }]}><Input maxLength={255} autoComplete="off" /></Form.Item>
        <Form.Item label="发布方 Client Secret" name="clientSecret" extra={editing !== 'new' && editing?.clientSecretConfigured ? '已配置；留空保留现有密钥。' : '配置发布方时需要填写。'} rules={[{ max: 255 }]}><Input.Password autoComplete="new-password" maxLength={255} /></Form.Item>
      </Form>
    </Drawer>
  </PageStack></section>
}
