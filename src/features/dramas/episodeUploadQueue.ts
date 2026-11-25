import type { EpisodeDraft } from './episodeDraft'

const fileNameCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

export type EpisodeQueueFilter = 'all' | 'pending' | 'active' | 'failed' | 'ready'

export interface EpisodeQueueSummary {
  total: number
  pending: number
  active: number
  failed: number
  ready: number
  progress: number
}

export interface PreparedEpisodeFiles {
  files: File[]
  duplicateCount: number
}

export function prepareEpisodeFiles(files: File[], existingFiles: File[]): PreparedEpisodeFiles {
  const known = new Set(existingFiles.map(fileFingerprint))
  const unique: File[] = []
  let duplicateCount = 0

  for (const file of files) {
    const fingerprint = fileFingerprint(file)
    if (known.has(fingerprint)) {
      duplicateCount += 1
      continue
    }
    known.add(fingerprint)
    unique.push(file)
  }

  unique.sort((left, right) => fileNameCollator.compare(left.name, right.name))
  return { files: unique, duplicateCount }
}

export function summarizeEpisodeQueue(episodes: EpisodeDraft[]): EpisodeQueueSummary {
  const summary: EpisodeQueueSummary = { total: episodes.length, pending: 0, active: 0, failed: 0, ready: 0, progress: 0 }
  let progressTotal = 0

  for (const episode of episodes) {
    progressTotal += episode.uploadState === 'ready' || episode.uploadState === 'processing'
      ? 100
      : Math.max(0, Math.min(100, episode.progress))
    if (episode.uploadState === 'missing' || episode.uploadState === 'waiting') summary.pending += 1
    if (episode.uploadState === 'uploading' || episode.uploadState === 'processing') summary.active += 1
    if (episode.uploadState === 'failed') summary.failed += 1
    if (episode.uploadState === 'ready') summary.ready += 1
  }

  summary.progress = summary.total === 0 ? 0 : Math.round(progressTotal / summary.total)
  return summary
}

export function filterEpisodeQueue(episodes: EpisodeDraft[], filter: EpisodeQueueFilter): EpisodeDraft[] {
  if (filter === 'all') return episodes
  return episodes.filter((episode) => {
    if (filter === 'pending') return episode.uploadState === 'missing' || episode.uploadState === 'waiting'
    if (filter === 'active') return episode.uploadState === 'uploading' || episode.uploadState === 'processing'
    return episode.uploadState === filter
  })
}

export function moveEpisodeToPosition(episodes: EpisodeDraft[], clientId: string, targetPosition: number, albumTitle: string): EpisodeDraft[] {
  const currentIndex = episodes.findIndex((episode) => episode.clientId === clientId)
  if (currentIndex < 0 || episodes.length === 0) return episodes
  const targetIndex = Math.max(0, Math.min(episodes.length - 1, Math.round(targetPosition) - 1))
  const next = [...episodes]
  const [episode] = next.splice(currentIndex, 1)
  next.splice(targetIndex, 0, episode)
  return next.map((item, index) => ({
    ...item,
    number: index + 1,
    title: item.autoTitle ? defaultTitle(albumTitle, index + 1) : item.title,
  }))
}

export function patchEpisodeAtIndex(episodes: EpisodeDraft[], index: number, patch: Partial<EpisodeDraft>): EpisodeDraft[] {
  const current = episodes[index]
  if (!current) return episodes
  const entries = Object.entries(patch) as [keyof EpisodeDraft, EpisodeDraft[keyof EpisodeDraft]][]
  if (entries.every(([key, value]) => Object.is(current[key], value))) return episodes
  const next = [...episodes]
  next[index] = { ...current, ...patch }
  return next
}

function fileFingerprint(file: File): string {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}\u0000${file.type}`
}

function defaultTitle(albumTitle: string, number: number): string {
  return `${albumTitle.trim() || '短剧'} Episode ${number}`
}
