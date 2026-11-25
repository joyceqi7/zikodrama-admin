import type { OperationsApi } from '../../api'
import { useEffect, useState } from 'react'
import { Avatar, Button, Checkbox, Col, Empty, Flex, Grid, Input, Pagination, Popconfirm, Row, Select, Table, Tag, Tooltip, Typography, type TableProps } from 'antd'
import { Clapperboard, Plus, RefreshCw, Search } from 'lucide-react'
import { permissionCodes, type DramaListItem, type DramaListQuery } from '../../domain'
import { useDirectPublicationActions } from './useDirectPublicationActions'
import { CopyCampaignLinkButton } from './CopyCampaignLinkButton'
import { hasOnlineCampaignTarget } from './campaignLinkAvailability'
import { publicationListState } from './publicationListState'
import { PageHeader, PageStack } from '../../components/PageHeader'
import { StatusBadge } from '../../components/StatusBadge'

/** DashboardProps 连接内容维护和独立直连发布，官方流程通过授权入口进入。 */
interface DashboardProps {
  /** can 按既有精确权限控制发布与投放动作。 */
  can?: (code: string) => boolean
  /** applicationId 仅用于生成实际 Mini 的投放链接。 */
  applicationId?: string
  /** applicationProvider 决定复制链接所需的渠道上线状态。 */
  applicationProvider?: string
  /** onOfficialPublication 进入该剧的官方流程，不自动同步或送审。 */
  onOfficialPublication?: (drama: DramaListItem) => void
  /** api 在渠道发布时校验并冻结已保存内容。 */
  api: OperationsApi
  /** canEdit 仅控制资料编辑，不授予发布权限。 */
  canEdit?: boolean
  /** dramas 是当前页内容摘要。 */
  dramas: DramaListItem[]
  /** query 是当前分页和内容筛选条件。 */
  query: DramaListQuery
  /** total 是匹配内容数量。 */
  total: number
  /** onQueryChange 重新查询筛选后的内容。 */
  onQueryChange: (query: DramaListQuery) => void
  /** loading 表示目录查询中。 */
  loading: boolean
  /** onCreate 打开新增内容页。 */
  onCreate: () => void
  /** onRefresh 刷新服务端权威内容状态。 */
  onRefresh: () => void
  /** onSelect 打开编辑或只读详情。 */
  onSelect: (drama: DramaListItem) => void
  /** onDelete 删除未被渠道引用的草稿，服务端再次检查删除门禁。 */
  onDelete?: (drama: DramaListItem) => Promise<void>
  /** canCreate 控制新增入口。 */
  canCreate: boolean
  /** canDelete 控制删除入口。 */
  canDelete?: boolean
  /** notify 展示统一操作结果。 */
  notify?: (message: string, tone?: 'success' | 'error') => void
}

/** Dashboard 统一维护内容和直连上下线，两渠道仍各自冻结发布版本。 */
export function Dashboard({ api, canEdit = false, dramas, query, total, onQueryChange, loading, onCreate, onRefresh, onSelect, onDelete, canCreate, canDelete = false, notify = () => {}, can = () => false, applicationId = '', applicationProvider, onOfficialPublication }: DashboardProps) {
  const [deletingID, setDeletingID] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const screens = Grid.useBreakpoint()
  const compact = Boolean(screens.xs && !screens.md)
  const [queryDraft, setQueryDraft] = useState(query.query ?? '')
  const [filterDirect, setFilterDirect] = useState<DramaListQuery['directStatus']>(query.directStatus)
  const { busyId, batchProgress, publish, batchPublish } = useDirectPublicationActions(api, onRefresh, notify)
  const canPublish = can('operations.direct_publication.read') && can('operations.direct_publication.publish')
  const canOffline = can('operations.direct_publication.read') && can('operations.direct_publication.offline')
  useEffect(() => { setQueryDraft(query.query ?? ''); setFilterDirect(query.directStatus) }, [query.query, query.directStatus])
  // 刷新和换页后仅保留尚未上线的勾选项，失败项可继续重试。
  useEffect(() => { setSelected(ids => ids.filter(id => dramas.some(d => d.id === id && d.directPublication?.status !== 'published'))) }, [dramas])
  const applyFilters = () => onQueryChange({ ...query, page: 1, query: queryDraft, contentStatus: undefined, directStatus: filterDirect })
  const resetFilters = () => { setQueryDraft(''); setFilterDirect(undefined); onQueryChange({ ...query, page: 1, query: '', contentStatus: undefined, directStatus: undefined }) }
  const selectable = (drama: DramaListItem) => canPublish && drama.directPublication?.status !== 'published'
  const runBatch = async () => {
    if (!canPublish || busyId || loading) return
    const failed = await batchPublish(dramas.filter(d => selected.includes(d.id) && selectable(d)))
    setSelected(failed)
  }
  const renderDirectActions = (drama: DramaListItem) => {
    const p = drama.directPublication
    const disabled = loading || Boolean(busyId) || Boolean(deletingID)
    const action = (kind: 'publish' | 'offline' | 'relist', label: string) => <Button size="small" type={kind === 'offline' ? 'default' : 'primary'} disabled={disabled} loading={busyId === drama.id} aria-label={`${label} ${drama.title}`} onClick={() => void publish(drama, kind)}>{label}</Button>
    return <>
      {canPublish && p?.status !== 'published' && (p?.version ? action('relist', `重新上线 V${p.version}`) : action('publish', '上线'))}
      {canPublish && Boolean(p?.version) && p?.pendingChanges && action('publish', '发布更新')}
      {canOffline && p?.status === 'published' && action('offline', '下线')}
    </>
  }
  const renderActions = (drama: DramaListItem) => <Flex gap={8} wrap data-ui="catalog-actions">
    <Button size="small" aria-label={`${canEdit ? '编辑' : '查看'} ${drama.title}`} onClick={() => onSelect(drama)}>{canEdit ? '编辑' : '查看'}</Button>
    {renderDirectActions(drama)}
    {onOfficialPublication && <Button size="small" onClick={() => onOfficialPublication(drama)}>官方发布</Button>}
    {can(permissionCodes.campaignCreate) && <CopyCampaignLinkButton api={api} dramaId={drama.id} applicationId={applicationId} online={hasOnlineCampaignTarget(drama, applicationProvider)} notify={notify} />}
    {canDelete && onDelete && <Tooltip title={drama.deleteBlocked ? '已有渠道发布内容或审核任务，暂不能删除' : undefined}><Popconfirm disabled={drama.deleteBlocked || loading || Boolean(busyId) || Boolean(deletingID)} title="删除短剧草稿？" description={`将永久删除“${drama.title}”及其全部分集。`} okText="确认删除" cancelText="取消" okButtonProps={{ danger: true, loading: deletingID === drama.id }} onConfirm={async () => {
      setDeletingID(drama.id)
      try { await onDelete(drama) } finally { setDeletingID('') }
    }}><Button danger size="small" disabled={drama.deleteBlocked || loading || Boolean(busyId) || Boolean(deletingID)} loading={deletingID === drama.id} aria-label={`删除 ${drama.title}`}>删除</Button></Popconfirm></Tooltip>}
  </Flex>
  const operatorName = (name?: string, id?: string) => name || (id ? `管理员 ${id}` : '—')
  const renderStatus = (drama: DramaListItem) => <Flex vertical gap={4}>
    <Tag color={drama.directPublication?.status === 'published' ? 'green' : undefined}>{drama.directPublication?.status === 'published' ? `已上线 · V${drama.directPublication.version}` : drama.directPublication?.version ? `已下线 · V${drama.directPublication.version}` : '未上线'}</Tag>
    {drama.directPublication?.pendingChanges && <Typography.Text type="secondary">有未发布修改</Typography.Text>}
  </Flex>
  const renderOfficial = (drama: DramaListItem) => <Flex vertical gap={4}>
    {Boolean(drama.officialRelease?.version) && drama.officialRelease && <Tag color={drama.officialRelease.status === 'online' ? 'green' : undefined}>{drama.officialRelease.status === 'online' ? '已上线' : '已下线'} · V{drama.officialRelease.version}</Tag>}
    {drama.publication ? <StatusBadge value={publicationListState(drama.publication).badgeValue} label={publicationListState(drama.publication).label} /> : <Typography.Text type="secondary">未同步</Typography.Text>}
  </Flex>
  const emptyState = <Empty description={query.query || query.directStatus ? '没有符合条件的短剧' : '还没有短剧'}>
    {query.query || query.directStatus ? <Button onClick={resetFilters}>清除筛选</Button> : canCreate ? <Button onClick={onCreate}>创建第一部短剧</Button> : null}
  </Empty>
  const columns: TableProps<DramaListItem>['columns'] = [
    { title: 'ID', dataIndex: 'id', width: 170, render: (id: string) => <Typography.Text data-ui="drama-id">{id}</Typography.Text> },
    { title: '短剧', width: 260, render: (_, drama) => <Flex align="center" gap={12}>
      <Avatar shape="square" size={44} src={drama.coverUrl || undefined} icon={<Clapperboard size={18} />} />
      <Flex vertical><Button type="link" data-ui="drama-title" onClick={() => onSelect(drama)}>{drama.title}</Button><Typography.Text type="secondary">{drama.status === 'completed' ? '已完结' : '连载中'} · {drama.year || '未设置年份'}</Typography.Text>
        {(drama.assignee || drama.operationDueAt) && <Typography.Text type="secondary">{drama.assignee ? `负责人：${drama.assignee}` : '未分配负责人'}{drama.operationDueAt ? ` · SLA ${new Date(drama.operationDueAt).toLocaleString('zh-CN', { hour12: false })}` : ''}</Typography.Text>}
      </Flex></Flex> },
    { title: '分集视频', width: 116, render: (_, drama) => <Flex vertical gap={4}><Typography.Text strong>{drama.episodeCount} 集</Typography.Text><Typography.Text type="secondary">{drama.readyEpisodeCount === drama.episodeCount && drama.episodeCount > 0 ? '全部已就绪' : `${drama.readyEpisodeCount} 集已就绪`}</Typography.Text></Flex> },
    { title: '直连状态', width: 150, render: (_, drama) => renderStatus(drama) },
    { title: '官方发布进度', width: 160, render: (_, drama) => renderOfficial(drama) },
    { title: '创建人', width: 140, ellipsis: true, render: (_, drama) => operatorName(drama.createdByName, drama.createdById) },
    { title: '最新操作人', width: 140, ellipsis: true, render: (_, drama) => operatorName(drama.updatedByName, drama.updatedById) },
    { title: '操作', fixed: 'right', width: 340, render: (_, drama) => renderActions(drama) },
  ]
  return <section aria-labelledby="dashboard-title" data-ui="drama-catalog"><PageStack>
    <PageHeader title="短剧管理" id="dashboard-title" eyebrow="维护短剧资料和分集视频，分别发布到直连与官方渠道" actions={<>
      <Button icon={<RefreshCw size={16} />} loading={loading} onClick={onRefresh}>刷新</Button>
      {canCreate && <Button type="primary" icon={<Plus size={16} />} onClick={onCreate}>新增短剧</Button>}
    </>} />
    <Flex gap={12} wrap align="center"><Typography.Text type="secondary">共 {total} 部短剧</Typography.Text>
      {canPublish && <Tooltip title="发布当前已保存内容；每部剧独立校验，失败项可重试">
        <Button aria-label={`批量上线${selected.length ? `（${selected.length}）` : ''}`} disabled={!selected.length || loading || Boolean(busyId)} loading={Boolean(batchProgress)} onClick={() => void runBatch()}>批量上线{selected.length ? `（${selected.length}）` : ''}</Button>
      </Tooltip>}
      {batchProgress && <Typography.Text role="status">已处理 {batchProgress.completed} / {batchProgress.total} 部</Typography.Text>}
    </Flex>
    <Row gutter={[12, 12]} align="middle" aria-label="短剧筛选" data-ui="drama-filters">
      <Col xs={24} md={10}><Input allowClear prefix={<Search size={16} />} value={queryDraft} onChange={event => setQueryDraft(event.target.value)} onPressEnter={applyFilters} placeholder="搜索短剧名称或标签" aria-label="搜索短剧" /></Col>
      <Col xs={24} sm={12} md={5}><Select aria-label="直连状态筛选" value={filterDirect ?? ''} options={[{ value: '', label: '全部直连状态' }, { value: 'unpublished', label: '未上线' }, { value: 'published', label: '已上线' }, { value: 'offline', label: '已下线' }]} onChange={value => setFilterDirect(value === 'unpublished' || value === 'published' || value === 'offline' ? value : undefined)} /></Col>
      <Col xs={24} sm={12} md={9}><Flex justify="flex-end" gap="small"><Button aria-label="重置" onClick={resetFilters}>重置</Button><Button aria-label="查询" type="primary" onClick={applyFilters}>查询</Button></Flex></Col>
    </Row>
    {compact ? <section aria-label="短剧列表" aria-busy={loading}><ul data-ui="drama-mobile-list">
      {dramas.map(drama => <li key={drama.id}>
        <Flex gap={12} align="flex-start">
          {canPublish && <Checkbox aria-label={`选择 ${drama.title}`} disabled={!selectable(drama) || Boolean(busyId)} checked={selected.includes(drama.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, drama.id] : ids.filter(id => id !== drama.id))} />}
          <Avatar shape="square" size={44} src={drama.coverUrl || undefined} icon={<Clapperboard size={18} />} />
          <Flex vertical gap={4}><Button type="link" data-ui="drama-title" onClick={() => onSelect(drama)}>{drama.title}</Button><Typography.Text type="secondary">{drama.status === 'completed' ? '已完结' : '连载中'} · {drama.year || '未设置年份'}</Typography.Text></Flex>
        </Flex>
        <Flex vertical gap={4} data-ui="drama-operators"><Typography.Text type="secondary">ID：<span data-ui="drama-id">{drama.id}</span></Typography.Text><Typography.Text type="secondary">创建人：{operatorName(drama.createdByName, drama.createdById)}</Typography.Text><Typography.Text type="secondary">最新操作人：{operatorName(drama.updatedByName, drama.updatedById)}</Typography.Text></Flex>
        <Flex justify="space-between" gap={12} wrap><Typography.Text>{drama.readyEpisodeCount} / {drama.episodeCount} 集已就绪</Typography.Text>{renderStatus(drama)}</Flex>
        <Flex gap={8} wrap>{renderOfficial(drama)}</Flex>
        {renderActions(drama)}
      </li>)}
    </ul>{!dramas.length && emptyState}<Pagination simple current={query.page} pageSize={query.pageSize} total={total} onChange={page => onQueryChange({ ...query, page })} /></section> : <Table size="small" tableLayout="fixed" rowKey="id" loading={loading} columns={columns} dataSource={dramas}
      rowSelection={canPublish ? { selectedRowKeys: selected, onChange: ids => setSelected(ids.map(String)), getCheckboxProps: drama => ({ disabled: !selectable(drama) || Boolean(busyId), 'aria-label': `选择 ${drama.title}` }) } : undefined}
      pagination={{ current: query.page, pageSize: query.pageSize, total, showSizeChanger: true, showTotal: count => `共 ${count} 条`, onChange: (page, pageSize) => onQueryChange({ ...query, page: pageSize === query.pageSize ? page : 1, pageSize }) }} locale={{ emptyText: emptyState }} scroll={{ x: 1500 }} />}
  </PageStack></section>
}
