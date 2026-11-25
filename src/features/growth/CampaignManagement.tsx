import { Alert, Button, Col, Divider, Drawer, Empty, Flex, Form, Input, Row, Select, Table, Tooltip, Typography, type TableProps } from 'antd'
import { Copy, Link2, Megaphone, Pencil, Plus, RefreshCw, Save, Target } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { OperationsApi } from '../../api'
import type { Campaign, CampaignInput, Drama } from '../../domain'
import type { CampaignTarget } from '../../campaignTarget'
import { reportOperationFailure } from '../../operationErrors'
import { PageHeader, PageStack, SectionHeader } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'

// CampaignManagementProps 将当前应用、权限和 API 边界传入投放配置页面。
interface CampaignManagementProps {
  // api 负责应用隔离的投放配置读写。
  api: OperationsApi
  // applicationFilter 在页面内选择应用，由外壳同步 API 上下文并重置投放数据。
  applicationFilter?: ReactNode
  // applicationName 展示当前应用名称。
  applicationName: string
  // dramas 提供关联展示的业务短剧信息。
  dramas: Pick<Drama, 'id' | 'title'>[]
  // canCreate 控制新建入口，服务端仍执行权限校验。
  canCreate: boolean
  // canUpdate 控制保存入口，服务端仍执行权限校验。
  canUpdate: boolean
  // notify 展示统一映射后的操作结果，不接收原始故障对象。
  notify(message: string, tone?: 'success' | 'error'): void
}

const emptyCampaign = (): CampaignInput => ({
  name: '', externalCampaignId: '', externalAdGroupId: '', externalAdId: '', externalCreativeId: '',
  dramaId: '', episodeId: '', experimentKey: '', status: 'active',
})

// CampaignManagement 编辑当前应用的投放入口；保存时保留表单未开放的归因字段。
export function CampaignManagement({ api, applicationFilter, applicationName, dramas, canCreate, canUpdate, notify }: CampaignManagementProps) {
  const [form] = Form.useForm<CampaignInput>()
  const [items, setItems] = useState<Campaign[]>([])
  // PublishedDramas 来自服务端按应用筛选的线上目录，不能使用全局草稿兜底。
  const [publishedDramas, setPublishedDramas] = useState<CampaignTarget[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null)
  const dramaId = Form.useWatch('dramaId', form) || ''
  const episodes = useMemo(() => publishedDramas.find((drama) => drama.id === dramaId)?.episodes ?? [], [dramaId, publishedDramas])
  const isNew = editing === 'new'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [campaigns, targets] = await Promise.all([api.listCampaigns(), api.listCampaignTargets()])
      setItems(campaigns)
      setPublishedDramas(targets)
    } catch (error) {
      notify(reportOperationFailure('加载投放配置失败', error), 'error')
    } finally {
      setLoading(false)
    }
  }, [api, notify])

  useEffect(() => { void load() }, [load]) // 该组件在 App 中以应用 ID 作为 key。

  const openCreate = () => {
    setEditing('new')
    form.setFieldsValue(emptyCampaign())
  }

  const openEdit = (campaign: Campaign) => {
    setEditing(campaign)
    form.setFieldsValue(toInput(campaign))
  }

  const save = async (input: CampaignInput) => {
    if (!editing) return
    setSaving(true)
    try {
      // 表单只提交可编辑字段；完整更新接口仍需保留已保存的归因标识和实验键。
      const saved = editing === 'new' ? await api.createCampaign(input) : await api.updateCampaign(editing.id, { ...toInput(editing), ...input })
      setItems((current) => current.some((item) => item.id === saved.id)
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [...current, saved].sort((left, right) => left.code.localeCompare(right.code)))
      setEditing(saved)
      notify(editing === 'new' ? '投放配置已生成' : '投放配置已保存')
    } catch (error) {
      notify(reportOperationFailure('保存投放配置失败', error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const copyLandingURL = async (campaign: Campaign) => {
    if (!campaign.landingUrl) {
      notify('该配置尚未取得 TikTok 官方链接，请重新生成投放配置', 'error')
      return
    }
    if (!navigator.clipboard?.writeText) {
      notify('当前浏览器不支持复制，请手动复制落地地址', 'error')
      return
    }
    try {
      await navigator.clipboard.writeText(campaign.landingUrl)
      notify('投放落地地址已复制')
    } catch (error) {
      notify(reportOperationFailure('复制投放落地地址失败', error), 'error')
    }
  }

  const columns: TableProps<Campaign>['columns'] = [
    {
      title: '投放配置',
      key: 'campaign',
      width: 220,
      render: (_, item) => (
        <Flex vertical>
          <Typography.Text strong>{item.name}</Typography.Text>
          <Typography.Text code>{item.code}</Typography.Text>
        </Flex>
      ),
    },
    {
      title: '落地内容',
      key: 'target',
      width: 240,
      render: (_, item) => {
        const drama = publishedDramas.find((candidate) => candidate.id === item.dramaId) ?? dramas.find((candidate) => candidate.id === item.dramaId)
        const episode = publishedDramas.find((candidate) => candidate.id === item.dramaId)?.episodes.find((candidate) => candidate.id === item.episodeId)
        return (
          <Flex vertical>
            <Typography.Text>{drama?.title ?? item.dramaId}</Typography.Text>
            <Typography.Text type="secondary">{episode ? `第 ${episode.number} 集 · ${episode.title}` : item.episodeId}</Typography.Text>
          </Flex>
        )
      },
    },
    {
      title: '落地地址',
      key: 'landingUrl',
      responsive: ['lg'],
      render: (_, item) => item.landingUrl
        ? <Typography.Text ellipsis={{ tooltip: item.landingUrl }} code>{item.landingUrl}</Typography.Text>
        : <Typography.Text type="warning">尚未取得官方链接</Typography.Text>,
    },
    { title: '状态', dataIndex: 'status', width: 90, render: (value: string) => <StatusBadge value={value} /> },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, item) => (
        <Flex gap={2}>
          <Tooltip title="复制落地地址"><Button type="text" icon={<Copy size={16} />} disabled={!item.landingUrl} onClick={() => void copyLandingURL(item)} aria-label={`复制 ${item.name} 落地地址`} /></Tooltip>
          <Tooltip title="编辑投放配置"><Button type="text" icon={<Pencil size={16} />} disabled={!canUpdate} onClick={() => openEdit(item)} aria-label={`配置 ${item.name}`} /></Tooltip>
        </Flex>
      ),
    },
  ]

  return (
    <section aria-labelledby="campaign-management-title">
      <PageStack>
        <PageHeader
          id="campaign-management-title"
          title="TikTok 投放配置"
          eyebrow={`当前 TikTok 应用：${applicationName}`}
          actions={<><Button size="small" icon={<RefreshCw size={16} />} loading={loading} onClick={() => void load()}>刷新</Button>{canCreate && <Button size="small" type="primary" icon={<Plus size={16} />} onClick={openCreate}>新建投放配置</Button>}</>}
        />
        <Flex wrap gap="middle" aria-label="投放配置筛选">{applicationFilter}</Flex>
        <Alert type="info" showIcon title="系统生成 TikTok 官方落地链接，广告计划在 Ads Manager 创建" description="仅可选择当前小程序已获授权的线上剧集。复制生成的链接后，到 TikTok Ads Manager 配置广告素材、预算和投放计划。" />
        <SectionHeader title={`投放配置列表 · ${items.length}`} icon={<Megaphone size={17} />} />
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={items}
          pagination={{ pageSize: 20, hideOnSinglePage: true, showTotal: (total) => `共 ${total} 条配置` }}
          columns={columns}
          locale={{ emptyText: <Empty description="当前应用暂无投放配置" /> }}
        />
      </PageStack>

      <Drawer
        open={editing !== null}
        title={isNew ? '新建投放配置' : `配置 ${editing?.name ?? ''}`}
        size={720}
        styles={{ wrapper: { maxWidth: '100vw' } }}
        onClose={() => setEditing(null)}
        extra={<Button type="primary" icon={<Save size={16} />} loading={saving} disabled={(isNew ? !canCreate || loading || publishedDramas.length === 0 : !canUpdate)} onClick={() => form.submit()}>{isNew ? '生成配置' : '保存'}</Button>}
      >
        <PageStack>
          {editing !== 'new' && editing?.landingUrl && (
            <Alert type="success" showIcon title="已生成投放落地地址" description={<Typography.Text code copyable={{ text: editing.landingUrl }}>{editing.landingUrl}</Typography.Text>} />
          )}
          <Form form={form} layout="vertical" initialValues={emptyCampaign()} onFinish={(value) => void save(value)}>
            {isNew && !loading && publishedDramas.length === 0 && <Alert type="info" showIcon title="当前小程序暂无可投放剧集" description="请运营人员先完成短剧上线；非持有小程序还需完成该剧授权。" />}
            <SectionHeader title="配置身份" icon={<Link2 size={17} />} />
            <Row gutter={16}>
              <Col xs={24} md={16}><Form.Item name="name" label="配置名称" rules={[{ required: true, message: '请输入便于投放识别的名称' }]}><Input maxLength={128} placeholder="例如 复仇剧情钩子 · 印尼 · 2026-07" /></Form.Item></Col>
              <Col xs={24} md={8}><Form.Item name="status" label="状态" rules={[{ required: true }]}><Select options={[{ value: 'active', label: '启用' }, { value: 'disabled', label: '停用' }]} /></Form.Item></Col>
            </Row>

            <Divider />
            <SectionHeader title="落地内容" icon={<Target size={17} />} />
            <Typography.Paragraph type="secondary">投放用户直接进入该短剧的指定剧集；配置创建后不允许改指向，避免历史归因混乱。</Typography.Paragraph>
            <Row gutter={16}>
              <Col xs={24} md={12}><Form.Item name="dramaId" label="落地短剧" rules={[{ required: true, message: '请选择已发布短剧' }]}><Select disabled={!isNew} showSearch optionFilterProp="label" options={publishedDramas.map((drama) => ({ value: drama.id, label: drama.title }))} onChange={(value) => {
                const firstEpisode = publishedDramas.find((drama) => drama.id === value)?.episodes[0]
                form.setFieldValue('episodeId', firstEpisode?.id || '')
              }} placeholder="选择已发布短剧" /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item name="episodeId" label="起播剧集" rules={[{ required: true, message: '请选择起播剧集' }]}><Select disabled={!isNew || !dramaId} options={episodes.map((episode) => ({ value: episode.id, label: `第 ${episode.number} 集 · ${episode.title}` }))} placeholder="选择起播剧集" /></Form.Item></Col>
            </Row>
          </Form>
        </PageStack>
      </Drawer>
    </section>
  )
}

function toInput(campaign: Campaign): CampaignInput {
  return {
    code: campaign.code, name: campaign.name,
    externalCampaignId: campaign.externalCampaignId, externalAdGroupId: campaign.externalAdGroupId,
    externalAdId: campaign.externalAdId, externalCreativeId: campaign.externalCreativeId,
    dramaId: campaign.dramaId, episodeId: campaign.episodeId, experimentKey: campaign.experimentKey, status: campaign.status,
  }
}
