import type { DramaListItem } from '../../domain'

/** CatalogAction 是列表按官方状态允许展示的操作，不替代服务端鉴权。 */
export type CatalogAction = 'submit' | 'submit_review' | 'publish' | 'withdraw' | 'retry' | 'review'
/** catalogActions 只返回当前状态可执行的动作；不确定的外部写必须先核对详情。 */
export function catalogActions(drama: DramaListItem): CatalogAction[] {
  const publication = drama.publication
  const prepared = Boolean(drama.coverUrl) && drama.episodeCount > 0 && drama.readyEpisodeCount === drama.episodeCount
  const differentVersion = prepared && publication?.currentContentChanged
  if (!publication) return prepared ? ['submit'] : []
  if (publication.status === 'under_review') return ['poll_review', 'poll_appeal'].includes(publication.stage) ? ['withdraw'] : []
  if (['queued', 'processing'].includes(publication.status)) return []
  if (differentVersion && publication.errorCode !== 'external_write_uncertain' && (publication.status !== 'rejected' || publication.reviewStatus === 4 || publication.currentContentChanged)) return ['submit']
  if (publication.status === 'synced' && publication.stage === 'await_submit_review') return ['submit_review']
  if (publication.status === 'approved') return ['publish']
  if (publication.status === 'failed') {
    if (publication.errorCode === 'external_write_uncertain') return []
    if (['poll_review', 'poll_appeal', 'await_publish'].includes(publication.stage)) return ['review']
    return ['retry']
  }
  if (publication.status === 'offline' || (publication.status === 'rejected' && publication.reviewStatus === 4)) return prepared ? ['submit'] : []

  return []
}
/** catalogActionLabel 根据最新审核与线上事实说明将要执行的动作。 */
export function catalogActionLabel(action: CatalogAction, _drama: DramaListItem): string {
  if (action === 'submit') return '同步 TikTok'
  if (action === 'submit_review') return '提交送审'
  return { publish: '上线', withdraw: '撤回审核', retry: '重试处理', review: '重试查询' }[action]
}
