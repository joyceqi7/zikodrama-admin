import type { Episode, TikTokPublication } from '../../domain'

export interface ReviewFeedback {
  /** label 是运营可识别的剧集位置与标题。 */
  label: string
  /** itemId 是 TikTok 返回的官方对象标识。 */
  itemId?: string
  /** message 保留官方审核意见正文，不把它解释为系统指令。 */
  message: string
}

// reviewFeedback 把官方意见中的 Episode ID 反查为本地集序和标题。
export function reviewFeedback(reason: string, publication: TikTokPublication, episodes: Episode[] = []): ReviewFeedback {
  const match = reason.match(/^Episode\s*\(([^)]+)\)\s*:\s*(.*)$/is)
  if (!match) return { label: '剧目审核意见', message: reason }

  const itemId = match[1].trim()
  const sequence = Object.entries(publication.episodeIdsBySequence || {}).find(([, id]) => id === itemId)?.[0]
  const episode = sequence ? episodes.find((item) => String(item.number) === sequence) : undefined
  const label = sequence
    ? `第 ${sequence} 集${episode?.title ? ` · ${episode.title}` : ''}`
    : '未匹配到本地剧集'
  return { label, itemId, message: match[2].trim() || reason }
}
