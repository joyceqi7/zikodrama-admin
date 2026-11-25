import { expect, test } from 'vitest'
import type { Episode, TikTokPublication } from '../../domain'
import { reviewFeedback } from './reviewFeedback'

test('按 TikTok Episode ID 定位本地集数和标题', () => {
  const publication = { episodeIdsBySequence: { '3': '7686905694566713364' } } as unknown as TikTokPublication
  const episodes = [{ number: 3, title: 'Episode 3' }] as Episode[]
  expect(reviewFeedback('Episode (7686905694566713364): Episode Video: policy reason', publication, episodes)).toEqual({
    label: '第 3 集 · Episode 3',
    itemId: '7686905694566713364',
    message: 'Episode Video: policy reason',
  })
})

test('无法匹配的官方分集仍保留 ID 和原始意见', () => {
  const publication = { episodeIdsBySequence: {} } as unknown as TikTokPublication
  expect(reviewFeedback('Episode (7686905694566713364): rejected', publication)).toEqual({
    label: '未匹配到本地剧集',
    itemId: '7686905694566713364',
    message: 'rejected',
  })
})
