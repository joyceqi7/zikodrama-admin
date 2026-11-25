import { expect, test } from 'vitest'
import type { Episode } from '../../domain'
import { canResumeDirectConfirmation, hasMediaWorkToSubmit, mergeEpisodeMediaJobs, reconcileEpisodeDraft, shouldRetryMediaJob, updateEpisodeDraftContent, type EpisodeDraft } from './episodeDraft'

test('episode content editing preserves localized titles and descriptions', () => {
  const draft: EpisodeDraft = {
    clientId: 'episode-1',
    id: 'episode-1',
    number: 1,
    title: 'Episode 1',
    description: '',
    posterUrl: '',
    durationSeconds: 60,
    vid: 'vid-1',
    pendingVid: '',
    pendingUploadRequestId: '',
    uploadState: 'ready',
    progress: 100,
    error: '',
    autoTitle: false,
  }

  const [updated] = updateEpisodeDraftContent([draft], draft.clientId, {
    title: ' Episode 1 updated ',
    description: ' Primary episode description ',
  }, 'Fallback title')

  expect(updated).toMatchObject({
    title: 'Episode 1 updated',
    description: 'Primary episode description',
    autoTitle: false,
  })
})

test('editing other fields keeps an unchanged generated title automatic', () => {
  const draft: EpisodeDraft = {
    clientId: 'episode-1',
    number: 1,
    title: '测试短剧 第1集',
    description: '',
    posterUrl: '',
    durationSeconds: 0,
    vid: '',
    pendingVid: '',
    pendingUploadRequestId: '',
    uploadState: 'waiting',
    progress: 0,
    error: '',
    autoTitle: true,
  }

  const [updated] = updateEpisodeDraftContent([draft], draft.clientId, {
    title: '测试短剧 第1集',
    description: '新增简介',
  }, '测试短剧 第1集')

  expect(updated.autoTitle).toBe(true)
})

test('a failed persisted media job retries without requiring the source file', () => {
  const draft: EpisodeDraft = {
    clientId: 'episode-1',
    id: 'episode-1',
    number: 1,
    title: 'Episode 1',
    description: '',
    posterUrl: '',
    durationSeconds: 0,
    vid: '',
    pendingVid: 'vid-processing-1',
    pendingUploadRequestId: 'request-1',
    mediaJobId: 'job-failed-1',
    uploadState: 'failed',
    progress: 100,
    error: 'VOD workflow failed',
    autoTitle: false,
  }

  expect(shouldRetryMediaJob(draft)).toBe(true)
  expect(shouldRetryMediaJob({ ...draft, file: new File(['video'], 'episode.mp4') })).toBe(false)
})

test('aggregate persistence does not erase a failed background media job', () => {
  const draft = failedMediaJobDraft()
  const persisted: Episode = {
    id: 'episode-1',
    dramaId: 'drama-1',
    number: 1,
    title: 'Episode 1',
    description: '',
    posterUrl: '',
    durationSeconds: 0,
    vid: '',
    mediaStatus: 'pending',
  }

  expect(reconcileEpisodeDraft(draft, persisted)).toMatchObject({
    mediaJobId: 'job-failed-1',
    pendingVid: 'vid-processing-1',
    uploadState: 'failed',
    error: 'VOD workflow failed',
  })
})

test('a replacement file remains actionable while an earlier batch is awaiting completion', () => {
  const failed = failedMediaJobDraft()
  expect(hasMediaWorkToSubmit([failed])).toBe(true)
  expect(hasMediaWorkToSubmit([{ ...failed, mediaJobId: undefined, pendingVid: '', file: new File(['video'], 'replacement.mp4'), uploadState: 'waiting' }])).toBe(true)
  expect(hasMediaWorkToSubmit([{ ...failed, uploadState: 'processing', error: '' }])).toBe(false)
})

test('an uploaded VOD item can resume API confirmation without the local File object', () => {
  const resumable = {
    ...failedMediaJobDraft(),
    mediaJobId: undefined,
    pendingUploadId: 'asset-1',
    expectedFileName: 'episode-1.mp4',
    expectedFileSize: 1024,
  }

  expect(canResumeDirectConfirmation(resumable)).toBe(true)
  expect(hasMediaWorkToSubmit([resumable])).toBe(true)
  expect(canResumeDirectConfirmation({ ...resumable, pendingUploadId: '' })).toBe(false)
})

test('polling an older media job does not erase a newly selected replacement file', () => {
  const replacement = {
    ...failedMediaJobDraft(),
    file: new File(['replacement'], 'replacement.mp4'),
    pendingVid: '',
    pendingUploadRequestId: '',
    mediaJobId: undefined,
    uploadState: 'waiting' as const,
    progress: 0,
    error: '',
  }

  const [merged] = mergeEpisodeMediaJobs([replacement], [{
    jobId: 'job-failed-1',
    episodeId: 'episode-1',
    fileName: 'old.mp4',
    size: 1024,
    remoteVid: 'vid-processing-1',
    uploadRequestId: 'request-1',
    status: 'failed',
    error: 'old workflow failed',
    createdAt: '2026-07-22T00:00:00Z',
    updatedAt: '2026-07-22T00:01:00Z',
  }])

  expect(merged.file).toBe(replacement.file)
  expect(merged).toMatchObject({ uploadState: 'waiting', mediaJobId: undefined, error: '' })
})

test('aggregate persistence keeps a replacement file when the previous media is ready', () => {
  const replacement = {
    ...failedMediaJobDraft(),
    vid: 'vid-old',
    file: new File(['replacement'], 'replacement.mp4'),
    pendingVid: '',
    pendingUploadRequestId: '',
    mediaJobId: undefined,
    uploadState: 'waiting' as const,
    progress: 0,
    error: '',
  }
  const persisted: Episode = {
    id: 'episode-1',
    dramaId: 'drama-1',
    number: 1,
    title: 'Episode 1',
    description: '',
    posterUrl: 'https://example.com/poster.jpg',
    durationSeconds: 60,
    vid: 'vid-old',
    mediaStatus: 'ready',
  }

  const reconciled = reconcileEpisodeDraft(replacement, persisted)

  expect(reconciled.file).toBe(replacement.file)
  expect(reconciled.uploadState).toBe('waiting')
})

function failedMediaJobDraft(): EpisodeDraft {
  return {
    clientId: 'episode-1',
    id: 'episode-1',
    number: 1,
    title: 'Episode 1',
    description: '',
    posterUrl: '',
    durationSeconds: 0,
    vid: '',
    pendingVid: 'vid-processing-1',
    pendingUploadRequestId: 'request-1',
    mediaJobId: 'job-failed-1',
    uploadState: 'failed',
    progress: 100,
    error: 'VOD workflow failed',
    autoTitle: false,
  }
}

 test('已有处理任务时不再把上传任务 ID 当作待确认文件', () => {
  const episode = { file: undefined, mediaJobId: 'upload-1', pendingUploadId: 'upload-1', pendingVid: 'vid-1', expectedFileName: 'one.mp4', expectedFileSize: 10, uploadState: 'processing' } as EpisodeDraft
  expect(canResumeDirectConfirmation(episode)).toBe(false)
  expect(hasMediaWorkToSubmit([episode])).toBe(false)
 })

test('已取得 VOD VID 的媒资任务故障转换为中文重试指引且保留任务以支持重试', () => {
  const [result] = mergeEpisodeMediaJobs([failedMediaJobDraft()], [{ jobId: 'job-failed-1', episodeId: 'episode-1', fileName: 'episode.mp4', size: 1024, remoteVid: 'vid-processing-1', status: 'failed', error: 'VOD workflow failed private-token', createdAt: '', updatedAt: '' }])
  expect(result.error).toBe('视频处理失败，请重试；仍无法完成时可重新选择视频')
  expect(shouldRetryMediaJob(result)).toBe(true)
})

test('未取得 VOD VID 的失败任务要求重新选择文件，不能重试处理', () => {
  const [result] = mergeEpisodeMediaJobs([failedMediaJobDraft()], [{ jobId: 'job-failed-1', episodeId: 'episode-1', fileName: 'episode.mp4', size: 1024, status: 'failed', error: 'upload failed', createdAt: '', updatedAt: '' }])
  expect(result.error).toBe('视频尚未上传成功，请重新选择视频上传')
  expect(shouldRetryMediaJob(result)).toBe(false)
  expect(hasMediaWorkToSubmit([result])).toBe(false)
})
