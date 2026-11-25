import type { TikTokPublication } from '../../domain'

/** episodeRange 将实际集序号合并为连续区间，缺集时不能伪装成完整范围。 */
export function episodeRange(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b)
  const ranges: string[] = []
  for (let index = 0; index < sorted.length; index += 1) {
    const start = sorted[index]
    let end = start
    while (sorted[index + 1] === end + 1) end = sorted[++index]
    ranges.push(start === end ? `${start}` : `${start}–${end}`)
  }
  return ranges.length ? `第 ${ranges.join('、')} 集` : '暂无分集'
}

/** publicationContentLabel 优先展示冻结的运营范围，缺少历史摘要时不以当前草稿冒充。 */
export function publicationContentLabel(publication: TikTokPublication): string {
  const summary = publication.contentSummary
  if (!summary) return '本次内容范围未记录'
  const all = episodeRange(summary.episodeNumbers)
  if (summary.previousEpisodeNumbers === null) return `本次内容 · ${all}`
  if (!summary.previousEpisodeNumbers.length) return `首次发布 · ${all}`
  const previous = new Set(summary.previousEpisodeNumbers)
  const added = summary.episodeNumbers.filter(number => !previous.has(number))
  return added.length ? `更新剧集 · 新增${episodeRange(added)}，共 ${added.length} 集` : `内容更新 · ${all}`
}

/** isReleaseStage 区分上线或下架异常与同步异常，用于恢复动作和权限判断。 */
export function isReleaseStage(publication: TikTokPublication | null): boolean {
  return Boolean(publication && ['set_online_version', 'list_album', 'delist_album'].includes(publication.stage))
}

/** isReviewStage 将送审、审核查询、申诉和撤回归入审核权限，不借用内容同步权限。 */
export function isReviewStage(publication: TikTokPublication | null): boolean {
  return Boolean(publication && ['submit_review', 'poll_review', 'await_publish', 'appeal_review', 'poll_appeal', 'withdraw_review'].includes(publication.stage))
}

/** editableRejectedAlbumPublication 仅对平台明确拒绝的 Album 同步失败显示内容修复入口；服务端再次核对写入检查点。 */
export function editableRejectedAlbumPublication(publication: Pick<TikTokPublication, 'status' | 'stage' | 'errorCode'> | null | undefined): boolean {
  return publication?.status === 'failed' && publication.stage === 'update_album' && publication.errorCode === 'api_rejected'
}

/** canRetryReviewSubmission 仅允许明确失败且尚无审核受理事实的送审重选优先级。 */
export function canRetryReviewSubmission(publication: Pick<TikTokPublication, 'status' | 'stage' | 'errorCode' | 'reviewId' | 'submittedAt'> | null | undefined): boolean {
  return publication?.status === 'failed' && publication.stage === 'submit_review' && publication.errorCode !== 'external_write_uncertain' && !publication.reviewId && !publication.submittedAt
}

/** retryReviewPriority 额度用尽时默认普通审核，其他失败保留原选择。 */
export function retryReviewPriority(publication: Pick<TikTokPublication, 'errorCode' | 'priority'>): 'normal' | 'urgent' {
  return publication.errorCode === 'urgent_review_quota_exceeded' ? 'normal' : publication.priority
}
