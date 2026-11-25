import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Flex, Form, Input, Modal, Space, Table, Tag, Typography } from 'antd'
import type { OperationsApi } from '../../api'
import type { TikTokTagSummary } from '../../domain'
import { reportOperationFailure } from '../../operationErrors'
import { toUserMessage } from '../../userMessage'

interface Props {
  // api 读取全局标签及当前主体关联数量，英文名更新仍全局共用。
  api: OperationsApi
  // canUpdate 控制编辑入口，服务端仍独立鉴权。
  canUpdate: boolean
}

// TikTokTagManagement 维护全局英文翻译；官方名称和 ID 只读，清空后回退原名。
export function TikTokTagManagement({ api, canUpdate }: Props) {
  const [tags, setTags] = useState<TikTokTagSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<TikTokTagSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState('')
  const [form] = Form.useForm<{ englishName: string }>()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setTags(await api.listTikTokTags()) }
    catch (failure) { reportOperationFailure('加载 TikTok 标签失败', failure); setError(toUserMessage(failure)) }
    finally { setLoading(false) }
  }, [api])
  useEffect(() => { void load() }, [load])

  const save = async ({ englishName }: { englishName: string }) => {
    if (!editing || saving || !canUpdate) return
    setSaving(true)
    setSaveError('')
    try {
      const tag = await api.updateTikTokTag(editing.id, englishName.trim())
      setTags((current) => current.map((item) => item.id === tag.id ? { ...item, ...tag } : item))
      setEditing(null)
      setSaved(`已保存「${tag.officialName}」的英文翻译`)
    } catch (failure) { reportOperationFailure('保存 TikTok 标签英文翻译失败', failure); setSaveError(toUserMessage(failure)) }
    finally { setSaving(false) }
  }
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = tags.filter((tag) => [tag.id, tag.officialName, tag.englishName || ''].some((text) => text.toLowerCase().includes(normalizedQuery)))
  return <Flex vertical gap={16}>
    <div>
      <Typography.Title level={2}>TikTok 标签</Typography.Title>
      <Typography.Paragraph type="secondary">维护所有应用共用的英文展示名。未填写英文翻译时，观众端显示官方原名。关联数量仅统计当前主体所选标签，包含未上线短剧。</Typography.Paragraph>
    </div>
    {error && <Alert type="error" title={error} showIcon action={<Button onClick={() => void load()}>重试</Button>} />}
    {saved && <div role="status">{saved}</div>}
    <Flex gap={12} wrap justify="space-between">
      <Input.Search aria-label="搜索 TikTok 标签" placeholder="搜索 ID、官方名称或英文翻译" value={query} onChange={(event) => setQuery(event.target.value)} allowClear data-ui="tiktok-tag-search" />
      <Space><Typography.Text type="secondary">已翻译 {tags.filter((tag) => tag.englishName).length} / {tags.length}</Typography.Text><Button loading={loading} onClick={() => void load()}>刷新</Button></Space>
    </Flex>
    <Table<TikTokTagSummary> rowKey="id" loading={loading} dataSource={filtered} scroll={{ x: 760 }} pagination={{ pageSize: 15, showSizeChanger: false, hideOnSinglePage: true }} columns={[
      { title: '官方 ID', dataIndex: 'id', width: 100 },
      { title: '官方名称', dataIndex: 'officialName', width: 160 },
      { title: '英文翻译', dataIndex: 'englishName', render: (value: string) => value || <Tag>未翻译</Tag> },
      { title: '关联短剧', dataIndex: 'dramaCount', width: 130, render: (count: number | undefined) => <span data-ui="tiktok-tag-count">{count === undefined ? '—' : `${count} 部短剧`}</span> },
      ...(canUpdate ? [{ title: '操作', key: 'actions', width: 100, render: (_: unknown, tag: TikTokTagSummary) => <Button type="link" aria-label={`编辑 ${tag.officialName} 英文翻译`} onClick={() => { setEditing(tag); setSaveError(''); setSaved(''); form.setFieldsValue({ englishName: tag.englishName || '' }) }}>编辑</Button> }] : []),
    ]} />
    <Modal className="tag-translation-modal" width={480} title="编辑英文翻译" open={editing !== null} okText="保存" cancelText="取消" confirmLoading={saving} closable={!saving} mask={{ closable: !saving }} keyboard={!saving} cancelButtonProps={{ disabled: saving }} onCancel={() => { if (!saving) setEditing(null) }} onOk={() => form.submit()} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={save}>
        <Flex gap={8} wrap align="baseline" className="tag-translation-source">
          <Typography.Text type="secondary">官方名称</Typography.Text>
          <Typography.Text strong>{editing?.officialName}</Typography.Text>
          <Typography.Text type="secondary">ID：{editing?.id}</Typography.Text>
        </Flex>
        {saveError && <Alert role="alert" type="error" title={saveError} showIcon data-ui="tiktok-tag-error" />}
        <Form.Item name="englishName" label="英文翻译" extra="最多 100 个字符。留空并保存后，恢复显示官方原名。" rules={[{ validator: async (_, value: string) => { if ([...(value || '').trim()].length > 100 || /\p{Cc}/u.test((value || '').trim())) throw new Error('请输入不含控制字符、最多 100 个字符的英文翻译') } }]}>
          <Input autoFocus disabled={saving} placeholder="例如：Mystery & Suspense" />
        </Form.Item>
      </Form>
    </Modal>
  </Flex>
}
