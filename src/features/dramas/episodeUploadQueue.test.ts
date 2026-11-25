import { expect, test } from 'vitest'
import type { EpisodeUploadState, EpisodeDraft } from './episodeDraft'
import { filterEpisodeQueue, moveEpisodeToPosition, patchEpisodeAtIndex, prepareEpisodeFiles, summarizeEpisodeQueue } from './episodeUploadQueue'

test('prepares a large video selection with natural filename ordering and duplicate removal', () => {
  const alreadySelected = new File(['same'], 'episode-03.mp4', { type: 'video/mp4', lastModified: 3 })
  const duplicateExisting = new File(['same'], 'episode-03.mp4', { type: 'video/mp4', lastModified: 3 })
  const episode10 = new File(['10'], 'episode-10.mp4', { type: 'video/mp4', lastModified: 10 })
  const episode2 = new File(['2'], 'episode-2.mp4', { type: 'video/mp4', lastModified: 2 })
  const episode1 = new File(['1'], 'episode-1.mp4', { type: 'video/mp4', lastModified: 1 })
  const duplicateInBatch = new File(['2'], 'episode-2.mp4', { type: 'video/mp4', lastModified: 2 })

  const result = prepareEpisodeFiles(
    [episode10, duplicateExisting, episode2, episode1, duplicateInBatch],
    [alreadySelected],
  )

  expect(result.files.map((file) => file.name)).toEqual(['episode-1.mp4', 'episode-2.mp4', 'episode-10.mp4'])
  expect(result.duplicateCount).toBe(2)
})

test('summarizes and filters the upload queue by operational state', () => {
  const episodes = [
    draft('missing', 0),
    draft('waiting', 0),
    draft('uploading', 45),
    draft('processing', 92),
    draft('failed', 30),
    draft('ready', 100),
  ]

  expect(summarizeEpisodeQueue(episodes)).toEqual({
    total: 6,
    pending: 2,
    active: 2,
    failed: 1,
    ready: 1,
    progress: 46,
  })
  expect(filterEpisodeQueue(episodes, 'pending')).toHaveLength(2)
  expect(filterEpisodeQueue(episodes, 'active')).toHaveLength(2)
  expect(filterEpisodeQueue(episodes, 'failed')).toHaveLength(1)
  expect(filterEpisodeQueue(episodes, 'ready')).toHaveLength(1)
})

test('moves an episode directly to a target position and keeps numbering continuous', () => {
  const first = { ...draft('waiting', 0), clientId: 'first', number: 1, title: '短剧 Episode 1', autoTitle: true }
  const second = { ...draft('waiting', 0), clientId: 'second', number: 2, title: '手动标题', autoTitle: false }
  const third = { ...draft('waiting', 0), clientId: 'third', number: 3, title: '短剧 Episode 3', autoTitle: true }

  const moved = moveEpisodeToPosition([first, second, third], 'third', 1, '短剧')

  expect(moved.map((episode) => episode.clientId)).toEqual(['third', 'first', 'second'])
  expect(moved.map((episode) => episode.number)).toEqual([1, 2, 3])
  expect(moved.map((episode) => episode.title)).toEqual(['短剧 Episode 1', '短剧 Episode 2', '手动标题'])
})

test('patches upload progress by known index and skips duplicate progress renders', () => {
  const episodes = [draft('uploading', 35), draft('waiting', 0)]

  expect(patchEpisodeAtIndex(episodes, 0, { uploadState: 'uploading', progress: 35 })).toBe(episodes)

  const updated = patchEpisodeAtIndex(episodes, 0, { progress: 36 })
  expect(updated).not.toBe(episodes)
  expect(updated[0]).toEqual(expect.objectContaining({ progress: 36 }))
  expect(updated[1]).toBe(episodes[1])
})

function draft(uploadState: EpisodeUploadState, progress: number): EpisodeDraft {
  return {
    clientId: `${uploadState}-${progress}`,
    number: 1,
    title: '短剧 Episode 1',
    description: '',
    posterUrl: '',
    durationSeconds: 0,
    vid: uploadState === 'ready' ? 'vid-ready' : '',
    pendingVid: '',
    pendingUploadRequestId: '',
    uploadState,
    progress,
    error: uploadState === 'failed' ? 'failed' : '',
    autoTitle: true,
  }
}
