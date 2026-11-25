import {
  Button,
  Collapse,
  Descriptions,
  Drawer,
  Flex,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd'
import type { DistributionApplication } from '../../applications'
import type { Drama, DramaListItem, TikTokPublication } from '../../domain'
import { publicationListState } from './publicationListState'
import { publicationContentLabel, episodeRange } from './publicationContent'
import { reviewFeedback } from './reviewFeedback'

interface Props {
  /** row 提供当前线上状态，不能被本次审核状态覆盖。 */
  row: DramaListItem
  /** drama 按需读取草稿及当前线上集数，不进入发布任务快照。 */
  drama?: Drama
  /** publication 为服务端保存的当前官方任务，缺省表示未同步。 */
  publication: TikTokPublication | null
  /** applications 只用于解析应用名称。 */
  applications: DistributionApplication[]
  /** loading 表示正在按需读取详情。 */
  loading: boolean
  /** error 只展示统一映射后的加载故障。 */
  error: string
  /** onRefresh 重新读取本地任务事实，不调用官方审核查询。 */
  onRefresh: () => void
  /** onClose 关闭详情并作废未完成的读取。 */
  onClose: () => void
  /** onOpenReviews 沿用官方发布读取权限，打开当前短剧的只读审核历史。 */
  onOpenReviews?: () => void
  /** onOpenReleases 打开上线历史，保持当前官方列表为操作入口。 */
  onOpenReleases?: () => void
}

/** OfficialPublicationDetailsDrawer 按需展示冻结内容、审核意见和处理进度；发布动作留在列表。 */
export function OfficialPublicationDetailsDrawer({
  row,
  drama,
  publication: p,
  applications,
  loading,
  error,
  onRefresh,
  onClose,
  onOpenReviews,
  onOpenReleases,
}: Props) {
  const names = new Map(
    applications.flatMap((app) => [
      [app.id, app.name],
      [app.tiktokAppId, app.name],
    ]),
  )
  return (
    <Drawer open title={`${row.title} · 发布详情`} onClose={onClose} size={680}>
      <Flex vertical gap={16}>
        <Space wrap>
          <Button loading={loading} onClick={onRefresh}>
            刷新详情
          </Button>
          {onOpenReviews && <Button onClick={onOpenReviews}>审核记录</Button>}
          {onOpenReleases && <Button onClick={onOpenReleases}>上线记录</Button>}
        </Space>
        <Typography.Text strong>
          {row.onlineVersion
            ? `当前已上线 · V${row.onlineVersion}`
            : '当前未上线'}
        </Typography.Text>
        {row.onlineVersion && drama?.onlineEpisodeNumbers && (
          <Typography.Text>
            已上线 {drama.onlineEpisodeNumbers.length} 集 ·{' '}
            {episodeRange(drama.onlineEpisodeNumbers)}
          </Typography.Text>
        )}
        {loading ? (
          <Skeleton paragraph={{ rows: 5 }} />
        ) : error ? (
          <Typography.Text type="danger" role="alert">
            {error}
          </Typography.Text>
        ) : (
          <>
            {p ? (
              <>
                <Tag>{publicationListState(p).label}</Tag>
                <Typography.Text>{publicationContentLabel(p)}</Typography.Text>
                {row.onlineVersion && p.status !== 'online' && (
                  <Typography.Text type="secondary">
                    本次任务不改变当前线上内容；新版本上线成功后才切换。
                  </Typography.Text>
                )}
                {p.currentContentChanged && (
                  <Typography.Text type="secondary">
                    当前内容有修改，本次任务继续使用同步时冻结的内容。
                  </Typography.Text>
                )}
                {p.status === 'failed' && (
                  <Typography.Paragraph>
                    {p.stage === 'update_album' &&
                    p.errorCode === 'api_rejected'
                      ? '剧目信息被官方明确拒绝，请修改并保存内容后重新同步；不能重试原来的内容。'
                      : publicationFailureHint(p.errorCode)}
                  </Typography.Paragraph>
                )}
                {p.errorCode === 'external_write_uncertain' && (
                  <Typography.Paragraph>
                    {p.stage === 'update_album' && (p.platformVersion ?? 0) > 0
                      ? '请使用「恢复同步」：先核对官方结果，仅原版本完整且未推进时恢复冻结内容。确认新版本后再送审。'
                      : '官方写入结果尚未确认，请核对原结果，不能重复同步、送审或上线。'}
                  </Typography.Paragraph>
                )}
                {p.reviewFailReasons?.map((reason, index) => {
                  const feedback = reviewFeedback(reason, p, drama?.episodes)
                  return (
                    <Flex key={index} vertical gap={2}>
                      <Typography.Text strong>{feedback.label}</Typography.Text>
                      {feedback.itemId && (
                        <Typography.Text
                          type="secondary"
                          copyable={{ text: feedback.itemId }}
                        >
                          TikTok Episode ID：{feedback.itemId}
                        </Typography.Text>
                      )}
                      <Typography.Text>{feedback.message}</Typography.Text>
                    </Flex>
                  )
                })}
                {p.appeal &&
                  p.reviewItems?.[p.appeal.itemId] === 6 &&
                  p.reviewStatus === 3 && (
                    <Typography.Text>
                      本次申诉项目已通过，当前版本仍有其他被拒项目，请继续处理审核意见。
                    </Typography.Text>
                  )}
                <PublicationMediaProgress publication={p} />
                <Collapse
                  items={[
                    {
                      key: 'facts',
                      label: '处理详情与诊断',
                      children: (
                        <Flex vertical gap={12}>
                          <Typography.Text>任务编号：{p.id}</Typography.Text>
                          {p.errorCode && (
                            <Typography.Text>
                              诊断代码：{p.errorCode}
                            </Typography.Text>
                          )}
                          <Descriptions
                            size="small"
                            column={1}
                            bordered
                            items={publicationDetails(p, names)}
                          />
                        </Flex>
                      ),
                    },
                  ]}
                />
              </>
            ) : (
              <Typography.Text>尚未同步到 TikTok</Typography.Text>
            )}
          </>
        )}
      </Flex>
    </Drawer>
  )
}

// PublicationMediaProgress 区分分集进展和轮询时间，旧接口缺少细节时只展示已确认事实。
export function PublicationMediaProgress({
  publication: p,
}: {
  /** publication 仅采用原任务确认的媒体事实，缺失信息不从草稿补造。 */
  publication: TikTokPublication
}) {
  const batches = p.transcodes ?? []
  const completed = batches.reduce(
    (sum, batch) =>
      sum +
      (batch.ready ? batch.vids.length : (batch.completedVids?.length ?? 0)),
    0,
  )
  const total = batches.reduce((sum, batch) => sum + batch.vids.length, 0)
  const latest = (field: 'lastProgressAt' | 'lastCheckedAt') =>
    batches
      .map((batch) => batch[field])
      .filter((value): value is string =>
        Boolean(value && !value.startsWith('0001-')),
      )
      .sort()
      .at(-1)
  const started = batches
    .map((batch) => batch.startedAt)
    .filter((value): value is string =>
      Boolean(value && !value.startsWith('0001-')),
    )
    .sort()[0]
  const elapsed =
    started && latest('lastCheckedAt')
      ? Math.max(
          0,
          Math.floor(
            (Date.parse(latest('lastCheckedAt')!) - Date.parse(started)) /
              60000,
          ),
        )
      : undefined
  return (
    <section data-ui="publication-media" aria-label="分集处理进度">
      <Flex gap={24} wrap>
        <div>
          <Typography.Text type="secondary">视频确认</Typography.Text>
          <Typography.Paragraph strong>
            {p.videos?.filter((video) => video.status === 'ready').length ?? 0}{' '}
            / {p.videos?.length ?? 0} 集
          </Typography.Paragraph>
        </div>
        <div>
          <Typography.Text type="secondary">官方转码</Typography.Text>
          <Typography.Paragraph strong>
            {completed} / {total} 集
          </Typography.Paragraph>
        </div>
      </Flex>
      {elapsed !== undefined && !Number.isNaN(elapsed) && (
        <Typography.Paragraph type="secondary">
          {total > 0 && completed === total ? '转码耗时' : '等待时长'}：
          {elapsed < 1 ? '不足 1 分钟' : `${elapsed} 分钟`}（截至最近检查）
        </Typography.Paragraph>
      )}
      {latest('lastProgressAt') && (
        <Typography.Paragraph type="secondary">
          最后进展：{formatTime(latest('lastProgressAt'))}
        </Typography.Paragraph>
      )}
      {latest('lastCheckedAt') && (
        <Typography.Text type="secondary">
          最近检查：{formatTime(latest('lastCheckedAt'))}
        </Typography.Text>
      )}
    </section>
  )
}

// publicationDetails 仅在诊断区展示平台标识和任务事实。
function publicationDetails(
  publication: TikTokPublication,
  applicationNames: Map<string, string>,
) {
  return [
    {
      key: 'owner',
      label: 'Album 持有应用',
      children:
        applicationNames.get(publication.ownerApplicationId) ||
        publication.ownerApplicationId,
    },
    {
      key: 'album',
      label: 'TikTok Album ID',
      children: copyableValue(publication.platformAlbumId),
    },
    {
      key: 'videos',
      label: '视频登记',
      children: `${publication.videos?.filter((video) => video.status === 'ready').length ?? 0}/${publication.videos?.length ?? 0} 集已确认`,
    },
    {
      key: 'transcodes',
      label: '官方转码',
      children: `${publication.transcodes?.filter((batch) => batch.ready).length ?? 0}/${publication.transcodes?.length ?? 0} 批已完成`,
    },
    {
      key: 'version',
      label: '官方版本',
      children: publication.platformVersion || '—',
    },
    {
      key: 'review',
      label: 'Review ID',
      children: copyableValue(publication.reviewId),
    },
    {
      key: 'reviewStatus',
      label: '官方审核状态值',
      children: String(publication.reviewStatus),
    },
    {
      key: 'submitted',
      label: '提交审核时间',
      children: formatTime(publication.submittedAt),
    },
    {
      key: 'online',
      label: '完成上架时间',
      children: formatTime(publication.onlineAt),
    },
  ]
}

// copyableValue 为已知标识提供复制，缺失时显示占位。
function copyableValue(value?: string) {
  return value ? <Typography.Text copyable>{value}</Typography.Text> : '—'
}

// formatTime 将有效时间转换为本地可读格式。
function formatTime(value?: string): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
}

// publicationFailureHint 按发布错误码给出恢复指引，不展示平台或旧任务保存的异常原文。
function publicationFailureHint(code?: string): string {
  switch (code) {
    case 'publication_in_recommendations':
      return '请先从官方轮播或热播中移除该短剧，再重试下线；当前线上内容保持不变。'
    case 'external_write_uncertain':
      return '官方结果尚未确认，本次冻结内容和已完成进度已保留。'
    case 'urgent_review_quota_exceeded':
      return '组织今日加急审核额度已用完，请选择普通审核重新提交，或等待加急额度恢复后再试。'
    case 'transcode_failed':
    case 'video_registration_rejected':
      return '视频处理失败，请检查或替换失败分集的视频后重新同步，已上线版本不受影响。'
    case 'owner_scope_changed':
      return '应用的平台账号或媒资空间已变化，请恢复提交时的配置后重试。'
    case 'platform_not_configured':
    case 'owner_application_unavailable':
    case 'language_mapping_missing':
      return '发布配置尚未完成，请检查应用的平台配置和短剧语言后重试。'
    case 'invalid_episode_mapping':
    case 'invalid_platform_response':
      return '尚未取得完整的剧集信息，请稍后重试；仍无法完成时请联系管理员。'
    case 'invalid_video_response':
      return '视频处理结果尚未确认，请从当前步骤继续查询。'
    case 'review_action_conflict':
      return '审核状态已变化，请查询最新审核结果后再操作。'
    case 'appeal_result_pending':
      return '申诉结果尚未返回，请继续查询，无需重复提交申诉。'
    default:
      return '自动处理已暂停，请检查当前步骤和分集状态后继续。'
  }
}
