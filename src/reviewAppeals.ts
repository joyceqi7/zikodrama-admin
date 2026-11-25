import type { TikTokPublication } from './domain'

/** reviewAppealOptions 只提供首次审核被拒的项目；历史记录缺少单项状态时由服务端查询确认。 */
export function reviewAppealOptions(publication?: TikTokPublication | null) {
  if (!publication) return []
  const hasItemResults = Object.keys(publication.reviewItems || {}).length > 0
  return [
    { value: publication.platformAlbumId || '', label: '剧目信息', type: 1 as const },
    ...Object.entries(publication.episodeIdsBySequence || {}).map(([sequence, id]) => ({ value: id, label: `第 ${sequence} 集`, type: 2 as const })),
  ].filter(item => {
    const state = publication.reviewItems?.[item.value]
    // 有单项结果时只允许明确被拒的项目，不能把整版被拒当作剧目信息也被拒。
    // 仅完全缺少单项结果的历史任务保留入口，实际写入前仍由服务端查询核对。
    return item.value && (state === 3 || (state === undefined && !hasItemResults))
  })
}
