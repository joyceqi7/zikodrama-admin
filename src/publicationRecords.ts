import type { TikTokPublication } from './domain'
import { reviewAppealOptions } from './reviewAppeals'

/** PublicationRecordKind 对应共享审核与上线记录。 */
export type PublicationRecordKind = 'reviews' | 'releases'
/** PublicationRecord 保存独立流程的结果，任务状态仅用于当前版本操作门禁。 */
export interface PublicationRecord {
  /** 记录及冻结审核版本的关联标识。 */
  id: string
  /** 共享短剧标识。 */
  dramaId: string
  /** 送审时名称。 */
  title: string
  /** 此流程的独立状态。 */
  status: string
  /** 发起管理员标识；历史未知时为空。 */
  actorId: string
  /** 发起管理员的可读昵称或账号。 */
  actorName?: string
  /** 首次发起时间。 */
  createdAt: string
  /** 最近结果更新时间。 */
  updatedAt: string
  /** 是否仍为最新任务。 */
  current: boolean
  /** 最新任务状态。 */
  taskStatus: string
  /** 最新任务阶段。 */
  taskStage: string
  /** 官方版本与审核结果。 */
  publication: TikTokPublication
}
/** PublicationRecordPage 是服务端分页结果。 */
export interface PublicationRecordPage {
  /** 当前页记录。 */
  items: PublicationRecord[]
  /** 匹配总数。 */
  total: number
}
/** PublicationRecordQuery 筛选指定短剧与流程状态。 */
export interface PublicationRecordQuery {
  /** 从一开始的页码。 */
  page: number
  /** 每页最多100条。 */
  pageSize: number
  /** 可选短剧标识。 */
  dramaId?: string
  /** 可选流程状态。 */
  status?: string
}
/** PublicationRecordAction 是记录页允许提交的业务动作。 */
export type PublicationRecordAction = 'review' | 'withdraw' | 'appeal' | 'publish' | 'retry' | 'unpublish'
/** publicationRecordActions 只为最新任务返回操作，冻结的通过结果不能重复发起上线。 */
export function publicationRecordActions(kind: PublicationRecordKind, record: PublicationRecord): PublicationRecordAction[] {
  if (!record.current) return []
  const { taskStatus: status, taskStage: stage } = record
  if (kind === 'reviews') {
    if (['set_online_version', 'list_album', 'delist_album', 'done'].includes(stage)) return []
    if (status === 'approved' && stage === 'await_publish') return ['publish']
    if (status === 'under_review' && ['poll_review', 'poll_appeal'].includes(stage)) return ['review', 'withdraw']
    if (status === 'rejected' && record.publication.reviewStatus !== 4 && reviewAppealOptions(record.publication).length > 0) return ['appeal']
    if (status === 'failed' && ['poll_review', 'poll_appeal', 'await_publish'].includes(stage)) return ['review']
    if (status === 'failed' && stage === 'update_album' && record.publication.errorCode === 'external_write_uncertain' && record.publication.platformAlbumId) return ['retry']
  } else if (status === 'online') return ['unpublish']
  if (status === 'failed' && record.publication.errorCode !== 'external_write_uncertain') return ['retry']
  return []
}
