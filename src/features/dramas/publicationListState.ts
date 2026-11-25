import type { DramaListPublication } from '../../domain'

// PublicationListState 是短剧列表对最新发布任务的精简展示。
export interface PublicationListState {
  // badgeValue 控制状态标签的颜色和图标。
  badgeValue: string
  // label 是运营人员可直接理解的当前状态。
  label: string
}

// publicationListState 将任务状态与处理阶段合并成列表中的最新进展。
export function publicationListState(publication: DramaListPublication): PublicationListState {
  // 下架沿用任务中的历史审核值；只有审核终态才能解释为已撤回。
  if (publication.status === 'rejected' && publication.reviewStatus === 4) return { badgeValue: 'withdrawn', label: '审核已撤回' }
  if (publication.status === 'failed') {
    if (publication.errorCode === 'urgent_review_quota_exceeded') return { badgeValue: 'failed', label: '加急审核额度已用完' }
    if (publication.errorCode === 'content_changed') return { badgeValue: 'draft', label: '内容已修改，待重新同步' }
    if (publication.errorCode === 'transcode_stalled') return { badgeValue: 'processing', label: '转码暂时没有进展' }
    if (publication.errorCode === 'external_write_uncertain') return { badgeValue: 'processing', label: '官方结果待确认' }
    const step = ['upload_cover', 'register_videos', 'transcode_videos'].includes(publication.stage) ? '素材处理' : ['create_album', 'update_album'].includes(publication.stage) ? '内容同步' : ['submit_review', 'poll_review', 'await_publish'].includes(publication.stage) ? '审核处理' : ['appeal_review', 'poll_appeal'].includes(publication.stage) ? '申诉处理' : publication.stage === 'withdraw_review' ? '撤回审核' : publication.stage === 'delist_album' ? '下架处理' : ['set_online_version', 'list_album'].includes(publication.stage) ? '上线处理' : '发布处理'
    return { badgeValue: 'failed', label: `${step}失败` }
  }
  if (publication.status === 'under_review') return { badgeValue: 'under_review', label: publication.stage === 'poll_appeal' ? '等待申诉结果' : '等待 TikTok 审核' }
  if (publication.status === 'synced') return { badgeValue: 'processing', label: '已同步，待送审' }
  if (publication.status === 'approved') return { badgeValue: 'approved', label: '审核通过，待上线' }
  if (publication.status === 'rejected') return { badgeValue: 'rejected', label: '审核未通过' }
  if (publication.status === 'online') return { badgeValue: 'published', label: '已上线' }
  if (publication.status === 'offline') return { badgeValue: 'delisted', label: '已下架' }

  const stageLabels: Partial<Record<DramaListPublication['stage'], string>> = {
    appeal_review: '正在提交审核申诉',
    poll_appeal: '等待申诉结果',
    withdraw_review: '正在撤回审核',
    upload_cover: '正在处理素材',
    register_videos: '正在处理素材',
    transcode_videos: '正在处理素材',
    create_album: '正在同步内容',
    update_album: '正在同步内容',
    await_submit_review: '已同步，待送审',
    submit_review: '正在提交审核',
    poll_review: '等待 TikTok 审核',
    await_publish: '审核通过，待上线',
    set_online_version: '正在上线',
    list_album: '正在上线',
    delist_album: '正在下架',
  }
  return { badgeValue: 'processing', label: stageLabels[publication.stage] ?? '系统正在处理' }
}
