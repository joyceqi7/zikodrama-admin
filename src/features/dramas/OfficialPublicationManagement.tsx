import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Flex,
  Grid,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { ApiError, type OperationsApi } from '../../api'
import type { DistributionApplication } from '../../applications'
import type {
  TikTokReleaseState,
  Drama,
  DramaListItem,
  DramaListQuery,
  TikTokPublication,
} from '../../domain'
import type { ApplicationHomePreview } from '../../directPlayback'
import { reportOperationFailure } from '../../operationErrors'
import { publicationListState } from './publicationListState'
import { CopyCampaignLinkButton } from './CopyCampaignLinkButton'
import { hasOnlineCampaignTarget } from './campaignLinkAvailability'
import { DramaAuthorizationDrawer } from './DramaAuthorizationDrawer'
import { HomePreviewDialog } from './HomePreviewDialog'
import { canRetryReviewSubmission } from './publicationContent'
import { reviewAppealOptions } from '../../reviewAppeals'
import { OfficialPublicationDetailsDrawer } from './OfficialPublicationDetailsDrawer'
import {
  OfficialPublicationActionDialog,
  type OfficialActionInput,
} from './OfficialPublicationActionDialog'
import {
  officialPublicationActions,
  sameOfficialTask,
  type OfficialAction,
  type OfficialPublicationPermissions,
} from './officialPublicationActions'

interface Props extends OfficialPublicationPermissions {
  /** api 复用既有官方目录、发布任务、鉴权与统一错误处理。 */
  api: OperationsApi
  /** applications 用于授权目标、固定官方首页预览和投放链接目标通道。 */
  applications?: DistributionApplication[]
  /** applicationId 是实际选中的 Mini，仅影响投放链接。 */
  applicationId?: string
  /** canCopyCampaign 控制投放链接创建权限。 */
  canCopyCampaign?: boolean
  /** notify 显示统一友好操作结果，操作失败不设置常驻错误条。 */
  notify?: (message: string, tone?: 'success' | 'error') => void
  /** initialDramaId 从历史地址或记录页打开列表中的详情抽屉。 */
  initialDramaId?: string
  /** onInspect 将详情选择写入列表地址，刷新后仍可恢复。 */
  onInspect?: (id: string) => void
  /** onInspectClose 清除地址中的详情选择。 */
  onInspectClose?: () => void
  /** onEdit 仅在已授权内容页面可用时进入草稿编辑。 */
  onEdit?: (id: string) => void
  /** onOpenReviews 从发布详情进入该短剧的只读审核历史。 */
  onOpenReviews?: (id: string) => void
  /** onOpenReleases 提供独立上线记录入口。 */
  onOpenReleases?: (id: string) => void
}
interface Detail {
  /** row 保留当前线上版本与内容状态，独立于审核任务。 */
  row: DramaListItem
  /** drama 提供真实线上集数和草稿分集名称。 */
  drama?: Drama
  /** publication 为按需读取的完整官方任务。 */
  publication: TikTokPublication | null
}
interface Pending {
  /** row 绑定用户点击的短剧。 */
  row: DramaListItem
  /** publication 绑定用户明确确认的任务，不能在提交时偷换新任务。 */
  publication: TikTokPublication | null
  /** action 是已经按状态及权限核验的动作。 */
  action: OfficialAction
}

// sameRelease 固定弹窗所见版本及上下架状态；新内容审核状态变化不阻止旧版本操作。
function sameRelease(a?: TikTokReleaseState | null, b?: TikTokReleaseState | null): boolean {
  return a?.selectedPublicationId === b?.selectedPublicationId && a?.version === b?.version && a?.status === b?.status
}

/** OfficialPublicationManagement 在一个列表内管理官方完整流程，详情、申诉与授权按需展开。 */
export function OfficialPublicationManagement({
  api,
  applications = [],
  applicationId = '',
  canCopyCampaign = false,
  notify = () => {},
  canSync = false,
  canReview = false,
  canRelease = false,
  canDistribute = false,
  initialDramaId,
  onInspect,
  onInspectClose,
  onEdit,
  onOpenReviews,
  onOpenReleases,
}: Props) {
  const [rows, setRows] = useState<DramaListItem[]>([]),
    [error, setError] = useState(''),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(false)
  const [query, setQuery] = useState(''),
    [publication, setPublication] = useState<DramaListQuery['publication']>(),
    [attempt, setAttempt] = useState(0)
  const [busyId, setBusyId] = useState(''),
    [pending, setPending] = useState<Pending>(),
    [submitting, setSubmitting] = useState(false)
  const [detail, setDetail] = useState<Detail>(),
    [detailLoading, setDetailLoading] = useState(false),
    [detailError, setDetailError] = useState('')
  const [authorizationDrama, setAuthorizationDrama] = useState<DramaListItem>()
  const [preview, setPreview] = useState<ApplicationHomePreview>(),
    [previewBusy, setPreviewBusy] = useState(false)
  const active = useRef(false),
    operation = useRef(false),
    listVersion = useRef(0),
    detailVersion = useRef(0)
  const permissions = { canSync, canReview, canRelease, canDistribute }
  // 投放链接绑定实际选中的 Mini，不能将官方列表的审核状态当成直连上线状态。
  const applicationProvider = applications.find(app => app.id === applicationId)?.playbackProvider
  const mobile = Grid.useBreakpoint().md === false
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  useEffect(() => {
    const version = ++listVersion.current
    let cancelled = false
    setLoading(true)
    setError('')
    void api
      .listDramas({ page, pageSize: 20, query, publication })
      .then((value) => {
        if (!cancelled && active.current && version === listVersion.current) {
          setRows(value.items)
          setTotal(value.total)
        }
      })
      .catch((reason) => {
        const message = reportOperationFailure('读取官方发布目录失败', reason)
        if (!cancelled && active.current && version === listVersion.current)
          setError(message)
      })
      .finally(() => {
        if (!cancelled && active.current && version === listVersion.current)
          setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [api, page, query, publication, attempt])
  // 自动刷新仅读取本地任务进度；官方审核及申诉结果始终由管理员明确查询。
  const refreshInterval = rows.some(
    (row) =>
      row.publication &&
      ['queued', 'processing'].includes(row.publication.status),
  )
    ? 5000
    : rows.some((row) => row.publication?.status === 'under_review')
      ? 10 * 60 * 1000
      : 0
  useEffect(() => {
    if (!refreshInterval) return
    const timer = window.setInterval(() => {
      if (!operation.current && document.visibilityState === 'visible')
        setAttempt((value) => value + 1)
    }, refreshInterval)
    return () => window.clearInterval(timer)
  }, [refreshInterval])
  const refresh = () => setAttempt((value) => value + 1)
  const findPublication = useCallback(
    async (id: string) => {
      try {
        return await api.findTikTokPublication(id)
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 404) return null
        throw reason
      }
    },
    [api],
  )
  const loadDetail = useCallback(
    async (row: DramaListItem) => {
      const version = ++detailVersion.current
      setDetail({ row, publication: null })
      setDetailLoading(true)
      setDetailError('')
      try {
        const [task, drama] = await Promise.all([
          findPublication(row.id),
          api.findDrama(row.id),
        ])
        if (active.current && version === detailVersion.current)
          setDetail({
            row: {
              ...row,
              ...drama,
              episodeCount: drama.episodes.length,
              readyEpisodeCount: drama.episodes.filter(
                (episode) => episode.mediaStatus === 'ready',
              ).length,
            },
            drama,
            publication: task,
          })
      } catch (reason) {
        const message = reportOperationFailure('读取官方发布详情失败', reason)
        if (active.current && version === detailVersion.current)
          setDetailError(message)
      } finally {
        if (active.current && version === detailVersion.current)
          setDetailLoading(false)
      }
    },
    [api, findPublication],
  )
  useEffect(() => {
    if (!initialDramaId) {
      detailVersion.current++
      setDetail(undefined)
      setDetailLoading(false)
      return
    }
    const row = {
      id: initialDramaId,
      title: `短剧 ${initialDramaId}`,
    } as DramaListItem
    void loadDetail(row)
  }, [initialDramaId, loadDetail])
  const closeDetail = () => {
    detailVersion.current++
    setDetail(undefined)
    setDetailLoading(false)
    onInspectClose?.()
  }
  const inspect = (row: DramaListItem) => {
    if (onInspect) onInspect(row.id)
    else void loadDetail(row)
  }
  const applyResult = (row: DramaListItem, next: TikTokPublication, independent = false) => {
    // 请求前的列表读取不能覆盖命令返回的进度；线上指针只在官方明确成功后变化。
    listVersion.current++
    setRows((current) =>
      current.map((item) =>
        item.id === row.id
          ? {
              ...item,
              publication: independent ? item.publication : next,
              ...(next.status === 'online' && next.platformVersion
                ? { onlineVersion: next.platformVersion }
                : next.status === 'offline'
                  ? { onlineVersion: undefined }
                  : {}),
            }
          : item,
      ),
    )
    refresh()
  }
  const runAction = async (value: Pending, input: OfficialActionInput = {}) => {
    const { row, publication: task, action } = value
    switch (action.kind) {
      case 'sync':
        return api.submitTikTokPublication(row.id, { transcode: input.transcode === true })
      case 'review':
        return task && canRetryReviewSubmission(task)
          ? api.retryTikTokPublication(row.id, {
              priority: input.priority || 'normal',
            })
          : api.submitTikTokReview(row.id, {
              priority: input.priority || 'normal',
            })
      case 'query':
        return api.refreshTikTokReview(row.id)
      case 'publish':
        return api.publishTikTokPublication(row.id, task!.id)
      case 'withdraw':
        return api.withdrawTikTokReview!(row.id)
      case 'appeal':
        return api.appealTikTokReview!(row.id, input.appeal!)
      case 'relist':
      case 'offline':
        if (row.officialRelease?.selectedPublicationId && api.changeTikTokRelease)
          return api.changeTikTokRelease(row.id, {
            action: action.kind === 'offline' ? 'delist' : 'list',
            selectedPublicationId: row.officialRelease.selectedPublicationId,
          })
        return api.unpublishDrama(row.id)
      case 'retry':
        return api.retryTikTokPublication(row.id)
    }
  }
  const enabledActions = (
    row: DramaListItem,
    task: Pending['publication'] | DramaListItem['publication'],
  ) =>
    officialPublicationActions(row, task, permissions)
      .filter(
        (action) =>
          action.kind !== 'withdraw' || Boolean(api.withdrawTikTokReview),
      )
      .filter(
        (action) => action.kind !== 'appeal' || Boolean(api.appealTikTokReview),
      )
  const actionMessage = (action: OfficialAction, next: TikTokPublication) =>
    action.kind === 'query'
      ? next.errorCode === 'external_write_uncertain'
        ? '已只读查询官方状态；仍须核对原审核记录，不会重复送审'
        : next.status === 'approved'
          ? '审核已通过，等待确认上线'
          : '已更新官方审核结果'
      : action.kind === 'sync'
        ? next.status === 'synced' ? '已同步 TikTok，请提交送审' : '视频处理中，完成后请提交送审'
        : action.kind === 'review'
          ? 'TikTok 已受理审核，通过后请确认上线'
          : action.kind === 'publish'
            ? '已上线，线上版本已更新'
            : action.kind === 'relist' ? `已重新上线 V${next.platformVersion}` : action.kind === 'offline'
              ? '已下线'
              : action.kind === 'withdraw'
                ? '已撤回送审'
                : action.kind === 'appeal'
                  ? 'TikTok 已受理申诉，请查询结果'
                  : action.kind === 'retry' && next.status === 'synced'
                    ? '同步已恢复，等待提交送审'
                    : action.label === '核对同步结果'
                    ? '已核对首次同步结果'
                    : '已完成本次操作，原冻结内容保持不变'
  const prepareAction = async (row: DramaListItem, action: OfficialAction) => {
    if (operation.current || loading) return
    operation.current = true
    setBusyId(row.id)
    try {
      const independent = ['offline', 'relist'].includes(action.kind) && Boolean(row.officialRelease)
      const [task, release] = await Promise.all([
        findPublication(row.id),
        api.findTikTokReleaseState ? api.findTikTokReleaseState(row.id) : Promise.resolve(row.officialRelease),
      ])
      if (!active.current) return
      if (independent ? !sameRelease(row.officialRelease, release) : !sameOfficialTask(row.publication, task)) {
        notify('发布状态已变化，请查看刷新后的状态再操作', 'error')
        refresh()
        return
      }
      if (
        !enabledActions(row, task).some((item) => item.kind === action.kind)
      ) {
        notify('当前状态或权限不支持此操作，请刷新后重试', 'error')
        refresh()
        return
      }
      if (action.kind === 'appeal' && !reviewAppealOptions(task).length) {
        notify('当前没有可申诉项目，请查看审核意见并修改内容', 'error')
        return
      }
      if (
        action.kind === 'retry' &&
        task?.errorCode === 'external_write_uncertain' &&
        !task.platformAlbumId
      ) {
        notify('缺少可核对的官方剧目标识，请先查看处理详情', 'error')
        return
      }
      const value = { row: { ...row, officialRelease: release || undefined }, publication: task, action }
      if (action.kind === 'query') {
        const next = await runAction(value)
        if (active.current) {
          applyResult(row, next, independent)
          notify(actionMessage(action, next), 'success')
        }
      } else setPending(value)
    } catch (reason) {
      const message = reportOperationFailure(
        `官方发布${action.label}失败`,
        reason,
      )
      if (active.current) notify(message, 'error')
    } finally {
      operation.current = false
      if (active.current) setBusyId('')
    }
  }
  const submit = async (input: OfficialActionInput) => {
    if (!pending || operation.current) return
    const value = pending
    operation.current = true
    setSubmitting(true)
    setBusyId(value.row.id)
    try {
      const independent = ['offline', 'relist'].includes(value.action.kind) && Boolean(value.row.officialRelease)
      const [current, release] = await Promise.all([
        findPublication(value.row.id),
        api.findTikTokReleaseState ? api.findTikTokReleaseState(value.row.id) : Promise.resolve(value.row.officialRelease),
      ])
      if (!active.current) return
      if (
        (independent ? !sameRelease(value.row.officialRelease, release) : !sameOfficialTask(value.publication, current) || !sameRelease(value.row.officialRelease, release)) ||
        !enabledActions(value.row, current).some(
          (action) => action.kind === value.action.kind,
        )
      ) {
        notify('发布状态已变化，请查看刷新后的状态再确认', 'error')
        setPending(undefined)
        refresh()
        return
      }
      if (
        value.action.kind === 'appeal' &&
        (!input.appeal ||
          !reviewAppealOptions(current).some(
            (item) =>
              item.value === input.appeal!.itemId &&
              item.type === input.appeal!.itemType,
          ))
      ) {
        notify('申诉对象已变化，请刷新审核结果后重试', 'error')
        setPending(undefined)
        refresh()
        return
      }
      const next = await runAction(value, input)
      if (active.current) {
        setPending(undefined)
        applyResult(value.row, next, independent)
        notify(actionMessage(value.action, next), 'success')
      }
    } catch (reason) {
      const message = reportOperationFailure(
        `官方发布${value.action.label}失败`,
        reason,
      )
      if (active.current) notify(message, 'error')
    } finally {
      operation.current = false
      if (active.current) {
        setSubmitting(false)
        setBusyId('')
      }
    }
  }
  const showPreview = async (id: string) => {
    if (previewBusy || !api.directRequest) return
    setPreviewBusy(true)
    try {
      const value = await api.directRequest<ApplicationHomePreview>(
        `/admin/v1/home-preview?applicationId=${encodeURIComponent(id)}`,
      )
      if (active.current) setPreview(value)
    } catch (reason) {
      const message = reportOperationFailure('读取官方应用首页预览失败', reason)
      if (active.current) notify(message, 'error')
    } finally {
      if (active.current) setPreviewBusy(false)
    }
  }
  const renderProgress = (row: DramaListItem) => (
    <Flex vertical align="flex-start" gap={4}>
      <Button
        type="link"
        className="official-publication-link"
        aria-label={`查看 ${row.title} 发布详情`}
        onClick={() => inspect(row)}
      >
        {row.publication
          ? row.officialRelease && (['online', 'offline'].includes(row.publication.status) || row.publication.id === row.officialRelease.selectedPublicationId && ['set_online_version', 'list_album', 'delist_album'].includes(row.publication.stage)) ? '审核已通过' : publicationListState(row.publication).label
          : '待同步'}
      </Button>
      {row.publication && (row.publication.platformVersion ?? 0) > 0 && row.officialRelease && !['online', 'offline'].includes(row.publication.status) && (
        <Typography.Text type="secondary">本次版本 V{row.publication.platformVersion}</Typography.Text>
      )}

      {row.publication?.currentContentChanged && (
        <Typography.Text type="secondary">
          新内容待同步
        </Typography.Text>
      )}
    </Flex>
  )
  const renderActions = (row: DramaListItem) => (
    <Flex wrap gap={8}>
      {enabledActions(row, row.publication).map((action) => (
        <Button
          key={action.kind}
          size="small"
          type={action.primary ? 'primary' : 'default'}
          danger={action.kind === 'offline'}
          disabled={loading || !!busyId}
          loading={busyId === row.id}
          onClick={() => void prepareAction(row, action)}
        >
          {action.label}
        </Button>
      ))}
      {onEdit && (
        <Button size="small" disabled={!!busyId} onClick={() => onEdit(row.id)}>
          修改内容
        </Button>
      )}
      {canDistribute && row.onlineVersion && (
        <Button size="small" onClick={() => setAuthorizationDrama(row)}>
          管理授权
        </Button>
      )}
      {canCopyCampaign && (
        <CopyCampaignLinkButton
          key={`${applicationId}:${row.id}`}
          api={api}
          dramaId={row.id}
          applicationId={applicationId}
          online={hasOnlineCampaignTarget(row, applicationProvider)}
          notify={notify}
        />
      )}
    </Flex>
  )
  const renderAuthorization = (row: DramaListItem) =>
    row.onlineVersion ? (
      <Button
        type="link"
        className="official-publication-link"
        aria-label={`查看 ${row.title} 授权小程序`}
        onClick={() => setAuthorizationDrama(row)}
      >
        {row.authorizedApplicationCount ?? 0} 个
      </Button>
    ) : (
      '—'
    )
  return (
    <Card data-ui="official-publication-list">
      <Flex vertical gap={16}>
        <Flex justify="space-between" wrap gap={12}>
          <div>
            <Typography.Title level={3}>TikTok 官方发布</Typography.Title>
            <Typography.Paragraph type="secondary">
              按发布进度完成同步、送审和上线。新内容的处理不改变当前线上版本。
            </Typography.Paragraph>
          </div>
          <Space wrap>
            {api.directRequest && (
              <Select
                aria-label="官方首页预览应用"
                placeholder="按应用预览首页"
                value={null}
                style={{ minWidth: 200 }}
                disabled={previewBusy}
                options={applications
                  .filter(
                    (app) =>
                      app.status === 'active' &&
                      app.playbackProvider !== 'byteplus_web',
                  )
                  .map((app) => ({ value: app.id, label: app.name }))}
                onChange={showPreview}
              />
            )}
            <Button disabled={loading || !!busyId} onClick={refresh}>
              刷新
            </Button>
          </Space>
        </Flex>
        <Space wrap>
          <Input.Search
            aria-label="搜索官方发布剧目"
            placeholder="搜索短剧标题或标签"
            onSearch={(value) => {
              setQuery(value)
              setPage(1)
            }}
          />
          <Select
            aria-label="官方发布状态筛选"
            value={publication || ''}
            style={{ minWidth: 150 }}
            options={[
              { value: '', label: '全部状态' },
              { value: 'draft', label: '未发布' },
              { value: 'syncing', label: '同步中' },
              { value: 'await_review', label: '待送审' },
              { value: 'under_review', label: '审核中' },
              { value: 'await_publish', label: '待上线' },
              { value: 'published', label: '已上线' },
              { value: 'rejected', label: '审核未通过' },
              { value: 'manual_attention', label: '需处理' },
            ]}
            onChange={(value) => {
              setPublication(
                value ? (value as DramaListQuery['publication']) : undefined,
              )
              setPage(1)
            }}
          />
        </Space>
        {error && (
          <Alert
            type="error"
            showIcon
            title={error}
            action={<Button onClick={refresh}>重新加载</Button>}
          />
        )}
        {mobile ? (
          <Flex vertical gap={12} aria-label="官方发布列表">
            {rows.map((row) => (
              <Card key={row.id} size="small" title={row.title}>
                <Flex vertical gap={8}>
                  {renderProgress(row)}
                  <Typography.Text>
                    {row.onlineVersion
                      ? `已上线 · V${row.onlineVersion}`
                      : row.officialRelease?.version ? `已下线 · V${row.officialRelease.version}` : '未上线'}
                  </Typography.Text>
                  <Space>授权小程序：{renderAuthorization(row)}</Space>
                  {renderActions(row)}
                </Flex>
              </Card>
            ))}
            <Space>
              <Button
                disabled={page === 1 || loading}
                onClick={() => setPage((value) => value - 1)}
              >
                上一页
              </Button>
              <Typography.Text>
                第 {page} 页 · 共 {total} 部
              </Typography.Text>
              <Button
                disabled={page * 20 >= total || loading}
                onClick={() => setPage((value) => value + 1)}
              >
                下一页
              </Button>
            </Space>
          </Flex>
        ) : (
          <Table
            rowKey="id"
            tableLayout="fixed"
            dataSource={rows}
            loading={loading}
            scroll={{ x: 1150 }}
            pagination={{
              current: page,
              pageSize: 20,
              total,
              showSizeChanger: false,
              onChange: setPage,
            }}
            columns={[
              { title: '短剧', dataIndex: 'title', width: 220 },
              {
                title: '发布进度',
                width: 180,
                render: (_, row) => renderProgress(row),
              },
              {
                title: '线上状态 / 版本',
                width: 150,
                render: (_, row) => (
                  <Tag color={row.onlineVersion ? 'green' : undefined}>
                    {row.onlineVersion
                      ? `已上线 · V${row.onlineVersion}`
                      : row.officialRelease?.version ? `已下线 · V${row.officialRelease.version}` : '未上线'}
                  </Tag>
                ),
              },
              {
                title: '授权小程序数',
                width: 130,
                render: (_, row) => renderAuthorization(row),
              },
              {
                title: '操作',
                width: 360,
                render: (_, row) => renderActions(row),
              },
            ]}
          />
        )}
        {pending && (
          <OfficialPublicationActionDialog
            key={`${pending.row.id}:${pending.publication?.id || 'new'}:${pending.action.kind}`}
            {...pending}
            busy={submitting}
            onCancel={() => setPending(undefined)}
            onSubmit={(input) => void submit(input)}
          />
        )}
        {detail && (
          <OfficialPublicationDetailsDrawer
            {...detail}
            applications={applications}
            loading={detailLoading}
            error={detailError}
            onRefresh={() => void loadDetail(detail.row)}
            onClose={closeDetail}
            onOpenReviews={
              onOpenReviews ? () => onOpenReviews(detail.row.id) : undefined
            }
            onOpenReleases={
              onOpenReleases ? () => onOpenReleases(detail.row.id) : undefined
            }
          />
        )}
        {authorizationDrama && (
          <DramaAuthorizationDrawer
            key={authorizationDrama.id}
            api={api}
            drama={
              rows.find((row) => row.id === authorizationDrama.id) ||
              authorizationDrama
            }
            applications={applications}
            canUpdate={canDistribute}
            onClose={() => setAuthorizationDrama(undefined)}
            onRefresh={refresh}
          />
        )}
        <HomePreviewDialog
          preview={preview}
          onClose={() => setPreview(undefined)}
        />
      </Flex>
    </Card>
  )
}
