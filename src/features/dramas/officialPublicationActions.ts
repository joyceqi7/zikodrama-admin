import type {
  DramaListItem,
  DramaListPublication,
  TikTokPublication,
} from '../../domain'
import {
  canRetryReviewSubmission,
  editableRejectedAlbumPublication,
} from './publicationContent'

/** OfficialPublicationAction 是列表允许的业务动作；服务端继续核验当前任务和权限。 */
export type OfficialPublicationAction =
  | 'sync'
  | 'review'
  | 'query'
  | 'withdraw'
  | 'appeal'
  | 'publish'
  | 'retry'
  | 'offline'
  | 'relist'
/** OfficialPublicationPermissions 分开控制同步、审核、上线与授权，不扩大已有权限。 */
export interface OfficialPublicationPermissions {
  /** canSync 允许同步和恢复素材处理。 */
  canSync?: boolean
  /** canReview 允许送审、查询、撤回和申诉。 */
  canReview?: boolean
  /** canRelease 允许确认上线和下线。 */
  canRelease?: boolean
  /** canDistribute 允许维护其他官方 Mini 的授权。 */
  canDistribute?: boolean
}
/** OfficialAction 描述当前任务对应的按钮，避免运营选择不适用的步骤。 */
export interface OfficialAction {
  /** kind 绑定既有官方管理命令。 */
  kind: OfficialPublicationAction
  /** label 明确普通恢复、素材重建和未知结果核对的区别。 */
  label: string
  /** primary 将当前主要待办突出显示。 */
  primary?: boolean
}

type Publication = DramaListPublication | TikTokPublication
const active = new Set([
  'queued',
  'processing',
  'synced',
  'under_review',
  'approved',
])
const releaseStages = new Set([
  'set_online_version',
  'list_album',
  'delist_album',
])
const reviewStages = new Set([
  'submit_review',
  'poll_review',
  'poll_appeal',
  'appeal_review',
  'withdraw_review',
  'await_publish',
])

/** officialNeedsSync 只把可重新同步的终态或待办视为新内容；未知写入始终保留原任务。 */
export function officialNeedsSync(p?: Publication | null): boolean {
  if (!p) return true
  if (p.errorCode === 'external_write_uncertain') return false
  if (['queued', 'processing', 'under_review'].includes(p.status)) return false
  if (
    (p.status === 'rejected' && p.reviewStatus === 4)
  )
    return true
  if (p.status === 'failed' && releaseStages.has(p.stage)) return false
  if (p.status === 'failed' && p.errorCode === 'content_changed') return true
  return (
    p.currentContentChanged &&
    ['online', 'offline', 'synced', 'approved', 'failed', 'rejected'].includes(p.status)
  )
}

/** officialPublicationActions 使用服务端摘要展示候选动作，提交前再读取完整任务核对；不自动提审或上线。 */
export function officialPublicationActions(
  row: Pick<DramaListItem, 'publishStatus' | 'onlineVersion' | 'officialRelease'>,
  p: Publication | null | undefined,
  permissions: OfficialPublicationPermissions,
): OfficialAction[] {
  const result: OfficialAction[] = []
  if (officialNeedsSync(p)) {
    if (permissions.canSync)
      result.push({
        kind: 'sync',
        label: row.officialRelease?.version || row.onlineVersion ? '同步更新' : '同步 TikTok',
        primary: true,
      })
  } else if (p && !['queued', 'processing'].includes(p.status)) {
    const uncertain = p.errorCode === 'external_write_uncertain'
    const retryReview = canRetryReviewSubmission(p)
    if (permissions.canReview) {
      if (p.status === 'synced' && p.stage === 'await_submit_review')
        result.push({ kind: 'review', label: '提交送审', primary: true })
      else if (retryReview)
        result.push({ kind: 'review', label: '重新提交送审', primary: true })
      if (
        (['under_review', 'approved', 'failed'].includes(p.status) &&
          ['poll_review', 'poll_appeal', 'await_publish'].includes(p.stage)) ||
        (p.status === 'failed' && p.stage === 'submit_review' && uncertain)
      ) {
        result.push({
          kind: 'query',
          label: uncertain
            ? '只读查询审核状态'
            : p.stage === 'poll_appeal'
              ? '查询申诉结果'
              : '查询审核结果',
        })
      }
      if (
        p.status === 'under_review' &&
        ['poll_review', 'poll_appeal'].includes(p.stage)
      )
        result.push({ kind: 'withdraw', label: '撤回送审' })
      if (
        p.status === 'rejected' &&
        [3, 7].includes(p.reviewStatus) &&
        !p.currentContentChanged
      )
        result.push({ kind: 'appeal', label: '提交申诉' })
    }
    if (
      p.status === 'failed' &&
      !(row.officialRelease && releaseStages.has(p.stage) && (p.stage === 'delist_album' || p.id === row.officialRelease.selectedPublicationId)) &&
      !retryReview &&
      !editableRejectedAlbumPublication(p) &&
      !['poll_review', 'poll_appeal', 'await_publish'].includes(p.stage)
    ) {
      if (uncertain) {
        if (permissions.canSync && p.stage === 'update_album')
          result.push({ kind: 'retry', label: (p.platformVersion ?? 0) > 0 ? '恢复同步' : '核对同步结果', primary: true })
      } else if (
        releaseStages.has(p.stage)
          ? permissions.canRelease
          : reviewStages.has(p.stage)
            ? permissions.canReview
            : permissions.canSync
      ) {
        const restart =
          (p.stage === 'transcode_videos' &&
            p.errorCode === 'transcode_failed') ||
          (p.stage === 'register_videos' &&
            p.errorCode === 'video_registration_rejected')
        result.push({
          kind: 'retry',
          label: releaseStages.has(p.stage)
            ? p.stage === 'delist_album'
              ? '重试下线'
              : '重试上线'
            : reviewStages.has(p.stage)
              ? '重试审核操作'
              : restart
                ? '重试该版本媒体处理'
                : '检查并继续同步',
          primary: true,
        })
      }
    }
  }
  // 已审核冻结版本仍可明确上线，当前草稿变更不替换此目标。
  if (permissions.canRelease && p?.status === 'approved' && p.stage === 'await_publish' && p.errorCode !== 'external_write_uncertain')
    result.push({ kind: 'publish', label: row.officialRelease?.version || row.onlineVersion ? '更新上线' : '确认上线', primary: true })
  const release = row.officialRelease
  if (release) {
    if (permissions.canRelease) {
      if (release.selectedPublicationId)
        result.push(release.status === 'online' ? { kind: 'offline', label: '下线' } : { kind: 'relist', label: `重新上线 V${release.version}` })
    }
    return result
  }
  // 新版同步或审核期间不另起下线；失败重试下线时也不重复创建任务。
  if (
    permissions.canRelease &&
    row.onlineVersion &&
    p &&
    p.errorCode !== 'external_write_uncertain' &&
    !active.has(p.status) &&
    !(p.status === 'failed' && p.stage === 'delist_album')
  )
    result.push({ kind: 'offline', label: '下线' })
  return result
}

/** sameOfficialTask 拒绝旧列表或旧弹窗上的动作，特别是用旧任务确认新审核版本上线。 */
export function sameOfficialTask(
  expected: Publication | null | undefined,
  current: TikTokPublication | null,
): boolean {
  if (!expected || !current) return !expected && !current
  return (
    Boolean(expected.id) &&
    expected.id === current.id &&
    expected.status === current.status &&
    expected.stage === current.stage &&
    expected.reviewStatus === current.reviewStatus &&
    expected.currentContentChanged === current.currentContentChanged &&
    expected.errorCode === current.errorCode &&
    (!('platformVersion' in expected) ||
      expected.platformVersion === current.platformVersion)
  )
}
