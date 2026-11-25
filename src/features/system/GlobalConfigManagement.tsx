import { safeErrorDetail } from '../../operationErrors'
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Empty, Flex, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Table, Tag, Typography } from 'antd'
import { Plus, RefreshCw, Settings2, ShieldCheck } from 'lucide-react'
import { ApiError, type GlobalConfig, type OperationsApi } from '../../api'
import { toUserMessage } from '../../userMessage'
import { ConfigValueEditor } from './ConfigValueEditor'
import { configFields, configValue, type ConfigField } from './configValueForm'
import { PageHeader, PageStack, SectionHeader } from '../../components/PageHeader'

interface Props {
  // api 只通过管理接口读写全局配置。
  api: OperationsApi
  // canUpdate 决定创建、编辑和删除入口是否可见。
  canUpdate: boolean
}
interface EditorValues {
  key: string
  remark: string
  media: Record<string, unknown>
}
const mediaTemplate = {
  access_key_id: '', secret_access_key: '', byteplus_account_id: '', space_name: '', vod_app_id: '', region: 'ap-southeast-1',
  max_file_bytes: 1073741824, upload_token_ttl_seconds: 3600, cover_domain: '',
  processing_timeout_seconds: 900, callback_url: '', callback_private_key: '',
}
// reportConfigFailure 记录脱敏后的实际错误与操作名，不输出配置对象或密钥。
function reportConfigFailure(operation: string, cause: unknown): string {
  const message = toUserMessage(cause)
  console.error('global configuration operation failed', { operation, code: cause instanceof ApiError ? cause.code : 'request_failed', message: safeErrorDetail(cause) })
  return message
}
const required = [{ required: true, message: '请填写此项' }]

// GlobalConfigManagement 为媒资提供分组表单，为其他全局配置按值类型生成可编辑表单。
// 表单内容只保存在当前组件内，密钥不写入浏览器存储。
export function GlobalConfigManagement({ api, canUpdate }: Props) {
  const [rows, setRows] = useState<GlobalConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<GlobalConfig | null>(null)
  const [open, setOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [search, setSearch] = useState('')
  const [fields, setFields] = useState<ConfigField[]>([])
  const [form] = Form.useForm<EditorValues>()
  const selectedKey = Form.useWatch('key', form)
  const isMedia = selectedKey === 'media'
  const [modal, modalContext] = Modal.useModal()
  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await api.listGlobalConfigs()) } catch (cause) { setError(reportConfigFailure('list', cause)) } finally { setLoading(false) }
  }, [api])
  useEffect(() => { void load() }, [load])
  const close = () => { setOpen(false); form.resetFields(); setEditing(null); setDirty(false); setError('') }
  const cancel = () => {
    if (saving) return
    if (dirty) { modal.confirm({ title: '放弃未保存的修改？', content: '已保存的配置不会受到影响。', okText: '放弃修改', cancelText: '继续编辑', onOk: close }); return }
    close()
  }
  const edit = (row: GlobalConfig | null) => {
    setFields(configFields(row?.value ?? {})); setEditing(row); setError(''); setNotice(''); setDirty(false); setOpen(true)
    form.setFieldsValue({ key: row?.key ?? '', remark: row?.remark ?? '', media: { ...mediaTemplate, ...(row?.key === 'media' ? row.value : {}) } })
  }
  const save = async ({ key, remark, media }: EditorValues) => {
    if (!canUpdate) return
    let value: Record<string, unknown>
    try { value = key === 'media' ? {} : configValue(fields) as Record<string, unknown> }
    catch (cause) {
      console.warn('global configuration validation rejected', { error: safeErrorDetail(cause) })
      setError(toUserMessage(cause, '请检查配置项')); return
    }
    setSaving(true); setError('')
    try {
      await api.saveGlobalConfig(key, key === 'media' ? media : value, remark ?? '')
      close()
      setNotice(key === 'media' ? 'VOD 配置已保存，后续操作使用新配置。' : '配置已保存。')
      await load()
    } catch (cause) { setError(reportConfigFailure('save', cause)) } finally { setSaving(false) }
  }
  const remove = async (key: string) => {
    setError('')
    try { await api.deleteGlobalConfig(key); await load() } catch (cause) { setError(reportConfigFailure('delete', cause)) }
  }
  const filtered = rows.filter(row => `${row.key} ${row.remark ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  return <PageStack>
    {modalContext}
    <PageHeader id="global-config-title" title="配置管理" eyebrow="统一管理跨应用的服务配置。" actions={<>
      <Button icon={<RefreshCw size={16} />} loading={loading} onClick={() => { setError(''); void load() }}>刷新</Button>
      {canUpdate && <Button type="primary" icon={<Plus size={16} />} onClick={() => edit(null)}>新增配置</Button>}
    </>} />
    {notice && <Alert type="success" title={notice} showIcon />}
    {error && !open && <Alert type="error" title={error} role="alert" showIcon />}
    <SectionHeader title={`配置列表 · ${rows.length}`} icon={<Settings2 size={17} />} actions={<Input.Search aria-label="搜索配置" placeholder="搜索 key 或备注" allowClear value={search} onChange={event => setSearch(event.target.value)} />} />
    <Table rowKey="key" loading={loading} dataSource={filtered} scroll={{ x: 1100 }} pagination={rows.length > 10 ? { pageSize: 10 } : false}
      locale={{ emptyText: <Empty description={search ? '没有匹配的配置' : '还没有全局配置'}>{canUpdate && !search && <Button type="primary" onClick={() => edit({ key: 'media', value: mediaTemplate })}>配置 BytePlus VOD</Button>}</Empty> }}
      columns={[
        { title: 'key', dataIndex: 'key', width: 180, render: (key: string) => <Typography.Text strong>{key}</Typography.Text> },
        { title: 'value', render: (_, row) => <Button type="link" onClick={() => edit(row)}>{row.key === 'media' ? '视频点播配置' : `${Object.keys(row.value).length} 个配置项`}</Button> },
        { title: '备注', dataIndex: 'remark', render: (value: string) => value || '—' },
        { title: '创建时间', dataIndex: 'createdAt', render: (value: string) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—' },
        { title: '更新时间', dataIndex: 'updatedAt', render: (value: string) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—' },
        { title: '操作人', dataIndex: 'updatedBy', render: (value: string) => value || '—' },
        { title: '操作', width: 150, fixed: 'right', render: (_, row) => <Space>
          <Button type="link" onClick={() => edit(row)}>{canUpdate ? '编辑' : '查看'}</Button>
          {canUpdate && row.key !== 'media' && <Popconfirm title="确认删除这条配置？" onConfirm={() => remove(row.key)}><Button type="link" danger>删除</Button></Popconfirm>}
        </Space> },
      ]} />
    <Modal centered width={820} styles={{ body: { maxHeight: '65vh', overflowY: 'auto' } }} title={isMedia ? 'BytePlus VOD 配置' : editing ? '编辑全局配置' : '新增全局配置'} open={open} onCancel={cancel} forceRender
      footer={<Flex justify="space-between" align="center" gap="small" wrap><Typography.Text type="secondary">{isMedia ? '保存后动态生效，进行中的操作不受影响' : '修改将应用于全局配置'}</Typography.Text><Space><Button disabled={saving} onClick={cancel}>{canUpdate ? '取消' : '关闭'}</Button>{canUpdate && <Button type="primary" loading={saving} onClick={() => form.submit()}>保存配置</Button>}</Space></Flex>}>
      {error && <Alert type="error" title={error} role="alert" />}
      <Form form={form} layout="vertical" onFinish={save} disabled={!canUpdate || saving} onValuesChange={() => setDirty(true)} scrollToFirstError>
        <Form.Item name="key" label="key" extra={isMedia ? 'media 是系统内置的视频点播配置。' : '唯一标识，保存后不能修改。使用 media 可进入视频点播配置表单。'} rules={[...required, { pattern: /^[a-z][a-z0-9_.-]{0,63}$/, message: '使用小写字母开头，最多64位，可包含数字、点、下划线和横线' }]}>
          <Input disabled={Boolean(editing)} autoComplete="off" placeholder="例如 media" />
        </Form.Item>
        <Form.Item name="remark" label="备注" rules={[{ max: 500, message: '备注最多 500 字' }]}><Input.TextArea aria-label="备注" autoSize={{ minRows: 2, maxRows: 4 }} maxLength={500} placeholder="说明配置用途，便于后续维护" /></Form.Item>
        {isMedia ? <PageStack>
          <Card size="small" title="接入信息">
            <Row gutter={20}>
              <Col xs={24} sm={12}><Form.Item name={['media', 'vod_app_id']} label="VOD 应用 ID" rules={required}><Input placeholder="填写 BytePlus 应用 ID" /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name={['media', 'region']} label="服务地域" rules={required}><Select options={[{ value: 'ap-southeast-1', label: '柔佛 · ap-southeast-1' }, { value: 'ap-singapore-1', label: '新加坡 · ap-singapore-1' }]} /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name={['media','byteplus_account_id']} label="BytePlus 账号 ID" extra="视频直传授权和 TikTok 官方发布需要；已有视频播放不依赖此项。" rules={[{pattern:/^[0-9]{1,64}$/,message:'请输入数字字符串账号 ID'}]}><Input maxLength={64} /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name={['media', 'space_name']} label="共享 VOD 空间名称" extra="所有主体的新上传和官方发布共用此空间，内容仍按主体隔离。" rules={[...required, { pattern: /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, message: '空间名称为 3～40 位小写字母、数字或横线，首尾须为字母或数字' }]}><Input maxLength={40} autoComplete="off" /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name={['media', 'cover_domain']} label="封面域名" rules={[...required, { pattern: /^https:\/\/[^/?#\s]+$/, message: '填写 HTTPS 域名，不包含路径' }]}><Input placeholder="https://cover.example.com" /></Form.Item></Col>
            </Row>
          </Card>
          <Card size="small" title="访问凭据" extra={<Tag icon={<ShieldCheck size={12} />}>仅服务端使用</Tag>}>
            <Typography.Paragraph type="secondary">已保存的凭据以掩码显示。无需更换时保持原值。</Typography.Paragraph>
            <Row gutter={20}>
              <Col xs={24} sm={12}><Form.Item name={['media', 'access_key_id']} label="Access Key ID" rules={required}><Input.Password autoComplete="new-password" placeholder="填写 Access Key ID" /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name={['media', 'secret_access_key']} label="Secret Access Key" rules={required}><Input.Password autoComplete="new-password" placeholder="填写 Secret Access Key" /></Form.Item></Col>
            </Row>
          </Card>
          <Card size="small" title="上传与处理">
            <Row gutter={20}>
              <Col xs={24} sm={12}><Form.Item name={['media', 'max_file_bytes']} label="单文件大小上限（字节）" extra="1 GiB = 1,073,741,824 字节" rules={required}><InputNumber min={1048576} max={107374182400} precision={0} /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name={['media', 'upload_token_ttl_seconds']} label="上传授权有效期（秒）" extra="60–7200 秒，默认 3600 秒" rules={required}><InputNumber min={60} max={7200} precision={0} /></Form.Item></Col>
              <Col xs={24} sm={12}><Form.Item name={['media', 'processing_timeout_seconds']} label="媒资处理超时（秒）" extra="60–7200 秒，默认 900 秒" rules={required}><InputNumber min={60} max={7200} precision={0} /></Form.Item></Col>
            </Row>
          </Card>
          <Card size="small" title="回调配置" extra={<Tag>可选</Tag>}>
            <Typography.Paragraph type="secondary">地址与密钥需同时填写。两项都留空时，通过定时查询获取处理结果。</Typography.Paragraph>
            <Form.Item name={['media', 'callback_url']} label="回调地址" rules={[{ type: 'url', message: '填写完整的 HTTP 或 HTTPS 地址' }]}><Input placeholder="https://api.example.com/callbacks/v1/byteplus/vod" /></Form.Item>
            <Form.Item name={['media', 'callback_private_key']} label="回调验签密钥" extra="与 BytePlus 控制台保持一致，8–20 位英文字母或数字。" rules={[{ pattern: /^(?:\*{8}|[a-zA-Z0-9]{8,20})?$/, message: '填写8–20位英文字母或数字' }]}><Input.Password autoComplete="new-password" placeholder="未启用回调时留空" /></Form.Item>
          </Card>
        </PageStack> : <Form.Item label="value"><ConfigValueEditor value={fields} onChange={next => { setFields(next); setDirty(true); setError('') }} disabled={!canUpdate || saving} /></Form.Item>}

      </Form>
    </Modal>
  </PageStack>
}
