import { toApplicationInput } from '../../applicationInput'
import { Avatar, Button, Col, Divider, Drawer, Empty, Flex, Form, Grid, Input, Modal, Pagination, Row, Select, Skeleton, Spin, Table, Tag, Typography, type TableProps } from 'antd'
import { KeyRound, Megaphone, Pencil, Plus, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { OperationsApi } from '../../api'
import type { Application, ApplicationInput } from '../../applications'
import { reportOperationFailure } from '../../operationErrors'
import { applicationAdUnitFormValue, applicationAdUnitsError, toApplicationAdUnits, type ApplicationAdUnitFormValue } from '../../applicationAdUnits'
import { PageHeader, PageStack } from '../../components/PageHeader'
import { ApplicationDramaAuthorizationModal } from './ApplicationDramaAuthorizationModal'
import { ApplicationAdUnitFields } from './ApplicationAdUnitFields'
import { AdConfiguration } from '../monetization/AdConfiguration'

interface ApplicationManagementProps {
  /** subjectId 是新建应用时固定归属的当前主体。 */
  subjectId: string
  // api 提供应用登记和完整更新接口。
  api: OperationsApi
  // applications 提供当前应用事实，保存时保留未在表单中维护的字段。
  applications: Application[]
  // canCreate 控制新建入口和提交。
  canCreate: boolean
  // canUpdate 控制应用资料和播放器选择的整体编辑。
  canUpdate: boolean
  // canDistribute 控制短剧选择与授权入口，需同时具备短剧读取和分发权限。
  canDistribute: boolean
  // loading 表示外部应用目录正在加载。
  loading: boolean
  // onRefresh 重新读取应用目录，失败由调用边界记录和提示。
  onRefresh(): Promise<void>
  // onChanged 将服务端保存结果同步到当前目录。
  onChanged(application: Application): void
  /** onEditingStateChange 在导航、切换主体或退出前保护应用及广告位草稿。 */
  onEditingStateChange?(dirty: boolean, saving: boolean): void
  // notify 展示统一的保存或失败提示，不暴露底层异常。
  notify(message: string, tone?: 'success' | 'error'): void
}

// ApplicationFormValue 仅包含当前应用的可见配置，拥有方凭据不进入表单状态。
type ApplicationFormValue = Pick<ApplicationInput, 'tiktokAppId' | 'name' | 'clientKey' | 'clientSecret' | 'playbackProvider' | 'status' | 'monetizationMode'> & ApplicationAdUnitFormValue

/** 管理应用身份、启用状态和广告位，列表同时支持单独配置广告位。 */
export function ApplicationManagement({
  api, subjectId, applications, canCreate, canUpdate, canDistribute, loading, onRefresh, onChanged, onEditingStateChange, notify,
}: ApplicationManagementProps) {
  const [form] = Form.useForm<ApplicationFormValue>()
  const [editing, setEditing] = useState<Application | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [editedAdTypes, setEditedAdTypes] = useState<string[]>([])
  const [discardOpen, setDiscardOpen] = useState(false)
  const [adApplication, setAdApplication] = useState<Application | null>(null)
  const [adDraft, setAdDraft] = useState({ dirty: false, saving: false })
  const updateAdDraft = useCallback((dirty: boolean, saving: boolean) => setAdDraft({ dirty, saving }), [])
  useEffect(() => {
    onEditingStateChange?.(dirty || adDraft.dirty, saving || adDraft.saving)
  }, [dirty, saving, adDraft, onEditingStateChange])
  useEffect(() => () => onEditingStateChange?.(false, false), [onEditingStateChange])
  useEffect(() => {
    if (!dirty && !saving) return
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty, saving])
  const [authorizingApp, setAuthorizingApp] = useState<Application | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const compact = Grid.useBreakpoint().lg === false
  const mode = Form.useWatch('monetizationMode', form)
  const status = Form.useWatch('status', form)
  const rewardedVideo = Form.useWatch('rewardedVideo', { form, preserve: true })
  const interstitial = Form.useWatch('interstitial', { form, preserve: true })
  const currentEditing = editing && editing !== 'new' ? applications.find((item) => item.id === editing.id) ?? editing : null
  const activationError = mode !== 'IAP' ? applicationAdUnitsError(toApplicationAdUnits({ rewardedVideo, interstitial })) : ''
  // 目录由上层完整加载，筛选和分页共享同一组结果；长标识符始终按字符串匹配。
  const search = query.trim().toLocaleLowerCase()
  const filtered = applications.filter((item) => (
    (statusFilter === 'all' || item.status === statusFilter)
    && (!search || item.name.toLocaleLowerCase().includes(search) || (item.tiktokAppId || '').toLocaleLowerCase().includes(search))
  ))
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 20)))
  const visibleApplications = filtered.slice((currentPage - 1) * 20, currentPage * 20)
  const hasFilters = !!query || statusFilter !== 'all'
  const resetFilters = () => { setQuery(''); setStatusFilter('all'); setPage(1) }

  const openCreate = () => {
    form.resetFields()
    setDirty(false)
    setEditedAdTypes([])
    form.setFieldsValue({ tiktokAppId: '', name: '', clientKey: '', monetizationMode: 'IAA', playbackProvider:'tiktok_minis', ...applicationAdUnitFormValue() })
    setEditing('new')
  }

  const openEdit = (application: Application) => {
    form.resetFields()
    setDirty(false)
    setEditedAdTypes([])
    form.setFieldsValue({ playbackProvider:application.playbackProvider ?? 'tiktok_minis',tiktokAppId: application.tiktokAppId, name: application.name, monetizationMode: application.monetizationMode ?? 'IAA', clientKey: application.clientKey, status: application.status, ...applicationAdUnitFormValue(application.adUnits) })
    form.setFields([{ name: 'interstitial', touched: false }])
    setEditing(application)
  }

  const save = async (input: ApplicationFormValue) => {
    if (!editing || saving || (editing === 'new' ? !canCreate : !canUpdate)) return
    setSaving(true)
    try {
      // 新建一次提交应用资料和广告位；普通编辑只替换实际修改的广告类型，保留其他已有数据。
      const { rewardedVideo, interstitial, ...details } = input
      const adUnits = toApplicationAdUnits({ rewardedVideo, interstitial })
      const previous = editing === 'new' ? null : toApplicationInput(applications.find((item) => item.id === editing.id) ?? editing)
      if (previous) {
        if (!editedAdTypes.includes('rewardedVideo')) adUnits.rewardedVideo = previous.adUnits.rewardedVideo
        if (!editedAdTypes.includes('interstitial')) adUnits.interstitial = previous.adUnits.interstitial
      }
      const updateInput = previous ? { ...previous, ...details, adUnits } : null
      if (updateInput && editing !== 'new') {
        // 播放器属于应用编辑；修订来自打开表单时的快照，目录刷新不能替旧表单取得新的并发许可。
        updateInput.playbackRevision = editing.playbackRevision ?? 0
      }
      const saved = editing === 'new'
        ? await api.createApplication({ subjectId, tiktokAppId: input.tiktokAppId.trim(), name: input.name.trim(), clientKey: input.clientKey.trim(), clientSecret: input.clientSecret!, monetizationMode: input.monetizationMode,playbackProvider:input.playbackProvider, adUnits })
        : await api.updateApplication(editing.id, updateInput!)
      onChanged(saved)
      form.resetFields()
      setDirty(false)
      setEditing(null)
      notify(editing === 'new' ? '应用已创建' : '应用已保存')
    } catch (error) {
      notify(reportOperationFailure('save application failed', error), 'error')
    } finally {
      setSaving(false)
    }
  }

  // refresh 记录列表读取失败，避免刷新按钮留下未处理的异步异常。
  const refresh = async () => {
    try { await onRefresh() }
    catch (error) { notify(reportOperationFailure('refresh applications failed', error), 'error') }
  }

  // 桌面表格和窄屏列表共用授权入口，打开后由运营明确选择线上短剧。
  const renderActions = (item: Application) => (
    <Flex gap={8} wrap>
      <Button icon={<Pencil size={14} />} disabled={!canUpdate} onClick={() => openEdit(item)} aria-label={`编辑 ${item.name}`}>编辑</Button>
      <Button icon={<Megaphone size={14} />} disabled={!canUpdate} onClick={() => setAdApplication(item)} aria-label={`广告位 ${item.name}`}>广告位</Button>
      <Button icon={<KeyRound size={14} />} disabled={!canDistribute || item.status !== 'active' || !item.clientKey.trim()} onClick={() => setAuthorizingApp(item)} aria-label={`授权短剧给 ${item.name}`}>授权短剧</Button>
    </Flex>
  )
  const renderIdentity = (item: Application) => (
    <Row gutter={12} align="middle" wrap={false}>
      <Col flex="none"><Avatar shape="square" size={36} aria-hidden="true">{Array.from(item.name.trim())[0]?.toLocaleUpperCase() || 'A'}</Avatar></Col>
      <Col flex="auto"><Flex vertical gap={4}>
        <Typography.Text strong>{item.name}</Typography.Text>
        {compact && <Tag>{item.playbackProvider==='byteplus_web'?'独立 VePlayer':'TikTok 官方'}</Tag>}
        <Typography.Text type="secondary"><small>App ID <samp>{item.tiktokAppId || '未填写'}</samp></small></Typography.Text>
      </Flex></Col>
    </Row>
  )
  const renderStatus = (item: Application) => <Tag variant="filled" color={item.status === 'active' ? 'success' : undefined}>{item.status === 'active' ? '启用' : '停用'}</Tag>
  const renderClientKey = (item: Application) => <Typography.Text type={item.clientKey ? undefined : 'secondary'} style={{ overflowWrap: 'anywhere' }}>{item.clientKey ? <samp>{item.clientKey}</samp> : '未配置'}</Typography.Text>
  const renderAdUnits = (item: Application) => {
    const types = [item.adUnits?.rewardedVideo?.length ? '激励视频' : '', item.adUnits?.interstitial?.length ? '插屏' : ''].filter(Boolean)
    return <Typography.Text type={types.length ? undefined : 'secondary'}>{types.join(' · ') || '未配置'}</Typography.Text>
  }
  const emptyState = <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={hasFilters ? '未找到匹配的应用' : '暂无应用'}>
    {hasFilters
      ? <Button onClick={resetFilters}>重置筛选</Button>
      : canCreate ? <Button type="primary" onClick={openCreate}>创建第一个应用</Button> : <Button onClick={() => void refresh()}>刷新列表</Button>}
  </Empty>

  const columns: TableProps<Application>['columns'] = [
    {
      title: '应用',
      key: 'application',
      // 保留名称与长 App ID 的阅读宽度，其他固定列不能把应用身份挤成单字列。
      width: 280,
      render: (_, item) => renderIdentity(item),
    },
    { title: '变现模式', key: 'monetizationMode', width: 116, render: (_, item) => <Tag>{item.monetizationMode ?? 'IAA'}</Tag> },
    { title: 'Client Key', key: 'clientKey', width: 220, render: (_, item) => renderClientKey(item) },
    { title: '广告位', key: 'adUnits', width: 148, render: (_, item) => renderAdUnits(item) },
    {title:'播放器',key:'playback',width:140,render:(_,item)=><Tag>{item.playbackProvider==='byteplus_web'?'独立 VePlayer':'TikTok 官方'}</Tag>},
    { title: '状态', key: 'status', width: 88, render: (_, item) => renderStatus(item) },
    {
      title: '操作',
      key: 'actions',
      width: 360,
      render: (_, item) => renderActions(item),
    },
  ]

  // 新建使用居中弹窗，编辑沿用抽屉；两者复用同一表单、保存和未保存修改保护。
  const closeEditor = () => { if (!saving) { if (dirty) setDiscardOpen(true); else setEditing(null) } }
  const saveButton = <Button type="primary" loading={saving} disabled={editing === 'new' ? !canCreate : !canUpdate} onClick={() => form.submit()}>保存</Button>
  const editorForm = (
        <Form form={form} layout="vertical" disabled={saving || (editing === 'new' ? !canCreate : !canUpdate)} scrollToFirstError={{ focus: true }} onValuesChange={changed => { setDirty(true); setEditedAdTypes(types => [...new Set([...types, ...Object.keys(changed)])]) }} onFinish={(value) => void save(value)}>
          <Row gutter={16}>
            <Col span={24}><Form.Item name="tiktokAppId" label="应用 ID" rules={[{ required: true, whitespace: true, message: '请输入 TikTok 应用 ID' }]}><Input placeholder="TikTok App ID" maxLength={255} disabled={editing !== 'new'} /></Form.Item></Col>
            <Col span={24}><Form.Item name="playbackProvider" label="播放器" extra="新版 Mini 上线后可修改，切换后使用目标通道的已上线短剧。"><Select disabled={saving || (editing === 'new' ? !canCreate : !canUpdate)} options={[{value:'tiktok_minis',label:'TikTok 官方播放器'},{value:'byteplus_web',label:'独立 VePlayer'}]} /></Form.Item></Col>
            <Col span={24}><Form.Item name="name" label="名称" rules={[{ required: true, whitespace: true, message: '请输入应用名称' }]}><Input maxLength={128} /></Form.Item></Col>
            <Col span={24}><Form.Item name="monetizationMode" label="变现模式" rules={[{ required: true, message: '请选择变现模式' }]}><Select options={[
              { value: 'IAA', label: 'IAA（广告变现）' },
              { value: 'IAP', label: 'IAP（内购变现）' },
              { value: 'IAA+IAP', label: 'IAA+IAP（混合变现）' },
            ]} /></Form.Item></Col>
          </Row>

          <Row gutter={16}>
              <Col span={24}><Form.Item name="clientKey" label="Client Key" extra="填写当前应用自己的 Client Key，用于剧目分发；首次保存后不可更换。" rules={[{ required: true, whitespace: true, message: '请输入当前应用的 Client Key' }]}><Input maxLength={255} disabled={!!currentEditing?.clientKey} /></Form.Item></Col>
          </Row>
          <Form.Item name="clientSecret" label="Client Secret"
            extra={editing === 'new' ? '填写当前小程序自己的 Secret，用于登录和生成推广链接。' : currentEditing?.clientSecretConfigured ? '已配置。留空保留原密钥，填写新值即可更换；原密钥不会回显。' : '尚未保存应用密钥，请补齐当前小程序的 Secret；历史环境变量配置仍兼容。'}
            rules={[{ required: editing === 'new', whitespace: true, message: '请输入当前应用的 Client Secret' }]}>
            <Input.Password autoComplete="new-password" maxLength={255} placeholder={currentEditing?.clientSecretConfigured ? '留空保留原密钥' : '当前小程序的 Client Secret'} />
          </Form.Item>

          <Divider>广告位配置</Divider>
          <ApplicationAdUnitFields required={status === 'active' && mode !== 'IAP'} disabled={saving || (editing === 'new' ? !canCreate : !canUpdate)} previousInterstitial={currentEditing?.adUnits.interstitial} />

          {editing !== null && editing !== 'new' && <>
            <Typography.Paragraph type="secondary">TikTok 发布方凭据在「主体管理」维护；BytePlus 账号和空间在「配置管理」维护。</Typography.Paragraph>
            <Row gutter={16}>
              <Col span={24}><Form.Item name="status" label="状态" extra={mode === 'IAP' ? '内购模式无需配置广告位。' : activationError || '激励视频和插屏均已配置，可以启用。'} rules={[{ validator: async (_, value) => { const error = form.getFieldValue('monetizationMode') !== 'IAP' ? applicationAdUnitsError(toApplicationAdUnits(form.getFieldsValue(true))) : ''; if (value === 'active' && error) throw new Error(error) } }]}><Select options={[{ value: 'active', label: '启用' }, { value: 'disabled', label: '停用' }]} /></Form.Item></Col>
            </Row>
          </>}
        </Form>
  )

  return (
    <section aria-labelledby="application-management-title">
      <PageStack>
        <PageHeader
          id="application-management-title"
          divider={false}
          title="TikTok 应用管理"
          eyebrow="登记应用身份、变现模式和广告位，也可在列表中单独配置广告位。"
          actions={<><Button icon={<RefreshCw size={15} />} loading={loading} onClick={() => void refresh()}>刷新</Button>{canCreate && <Button type="primary" icon={<Plus size={16} />} onClick={openCreate}>新建应用</Button>}</>}
        />
        <Row gutter={[16, 12]} align="middle">
          <Col xs={24} lg={10}><Typography.Text type="secondary" role="status" aria-live="polite">{hasFilters ? `找到 ${filtered.length} 个，共 ${applications.length} 个应用` : `共 ${applications.length} 个应用`}</Typography.Text></Col>
          <Col xs={24} lg={14}><Flex gap="small" role="search" aria-label="应用筛选">
            <Input prefix={<Search size={16} aria-hidden="true" />} aria-label="搜索应用" placeholder="搜索名称或 App ID" allowClear value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} />
            <Select aria-label="应用状态" value={statusFilter} onChange={(value) => { setStatusFilter(value); setPage(1) }} options={[{ value: 'all', label: '全部状态' }, { value: 'active', label: '启用' }, { value: 'disabled', label: '停用' }]} />
          </Flex></Col>
        </Row>
        {compact ? <Spin spinning={loading}>
          {loading && !applications.length ? <Skeleton title paragraph={{ rows: 3 }} /> : visibleApplications.length ? <Flex component="ul" vertical gap="middle" aria-label="应用列表">
            {visibleApplications.map((item) => <Flex component="li" vertical gap="middle" key={item.id}>
              <Row gutter={12} align="top" wrap={false}><Col flex="auto">{renderIdentity(item)}</Col><Col flex="none">{renderStatus(item)}</Col></Row>
              <Typography.Text>变现模式：<Tag>{item.monetizationMode ?? 'IAA'}</Tag></Typography.Text>
              <Row gutter={16}>
                <Col span={12}><Flex vertical gap={4}><Typography.Text type="secondary">Client Key</Typography.Text>{renderClientKey(item)}</Flex></Col>
                <Col span={12}><Flex vertical gap={4}><Typography.Text type="secondary">广告位</Typography.Text>{renderAdUnits(item)}</Flex></Col>
              </Row>
              <Flex justify="flex-end">{renderActions(item)}</Flex>
              <Divider size="small" />
            </Flex>)}
          </Flex> : emptyState}
        </Spin> : <Table
          size="middle"
          rowKey="id"
          loading={loading}
          dataSource={visibleApplications}
          pagination={false}
          columns={columns}
          scroll={{ x: 1352 }}
          locale={{ emptyText: emptyState }}
        />}
        <Flex justify="flex-end"><Pagination current={currentPage} pageSize={20} total={filtered.length} hideOnSinglePage showSizeChanger={false} onChange={setPage} /></Flex>
      </PageStack>

      <Modal open={editing === 'new'} title="新建应用" centered destroyOnHidden
        width={compact ? 'calc(100vw - 24px)' : 640}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
        onCancel={closeEditor} mask={{ closable: !saving }} keyboard={!saving}
        footer={<Flex justify="flex-end" gap="small"><Button disabled={saving} onClick={closeEditor}>取消</Button>{saveButton}</Flex>}>
        {editing === 'new' && editorForm}
      </Modal>
      <Drawer open={editing !== null && editing !== 'new'} title={`配置 ${currentEditing?.name ?? ''}`} size={480}
        onClose={closeEditor} extra={saveButton}>
        {editing !== null && editing !== 'new' && editorForm}
      </Drawer>
      <Modal title="放弃应用的修改？" open={discardOpen} okText="放弃修改" cancelText="继续编辑" okButtonProps={{ danger: true }} onCancel={() => setDiscardOpen(false)} onOk={() => { setDiscardOpen(false); setDirty(false); form.resetFields(); setEditing(null) }}>尚未保存的应用及广告位配置将丢失。</Modal>
      {adApplication && <AdConfiguration key={adApplication.id} api={api} application={applications.find(item => item.id === adApplication.id) ?? adApplication} loading={false} canUpdate={canUpdate} onChanged={onChanged} onClose={() => setAdApplication(null)} onDraftChange={updateAdDraft} notify={notify} />}
      {authorizingApp && <ApplicationDramaAuthorizationModal api={api} application={authorizingApp} onClose={() => setAuthorizingApp(null)} notify={notify} />}
    </section>
  )
}
