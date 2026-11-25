import { expect, test } from 'vitest'
import type { TikTokPublication } from '../../domain'
import { episodeRange, publicationContentLabel } from './publicationContent'

test('集数范围保留缺集事实，不按首尾推测连续', () => {
  expect(episodeRange([5, 1, 2, 2, 7, 8])).toBe('第 1–2、5、7–8 集')
})

test('首次发布与连载更新使用固定内容范围，不暴露版本管理', () => {
  const publication = { contentSummary: { episodeNumbers: [1, 2, 3], previousEpisodeNumbers: [] } } as unknown as TikTokPublication
  expect(publicationContentLabel(publication)).toBe('首次发布 · 第 1–3 集')
  expect(publicationContentLabel({ ...publication, contentSummary: { episodeNumbers: [1, 2, 3], previousEpisodeNumbers: [1] } })).toBe('更新剧集 · 新增第 2–3 集，共 2 集')
  expect(publicationContentLabel({ ...publication, contentSummary: { episodeNumbers: [1, 2, 3], previousEpisodeNumbers: null } })).toBe('本次内容 · 第 1–3 集')
  expect(publicationContentLabel({} as TikTokPublication)).toBe('本次内容范围未记录')
})
