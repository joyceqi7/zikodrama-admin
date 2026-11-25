import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ApiError, type OperationsApi } from '../../api'
import { permissionCodes, type Drama, type DramaInput, type Episode, type MediaJob } from '../../domain'
import { DirectUploadError } from '../../media/byteplusUploader'
import { DramaEditor } from './DramaEditor'
import { episodeDraftsFromEpisodes } from './episodeDraft'
import { persistUploadBatch, restoreUploadBatch } from './uploadBatchPersistence'
import { identifyUploadFile } from './uploadFileIdentity'

beforeEach(() => {
  const entries = new Map<string, string>()
  vi.stubGlobal('localStorage', { get length() { return entries.size }, key: (index: number) => [...entries.keys()][index] ?? null, getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value), removeItem: (key: string) => entries.delete(key), clear: () => entries.clear() })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const emptyDraft: Drama = { id: 'draft-1', title: '测试草稿', description: '测试短剧简介', coverUrl: 'https://example.test/cover.png', tags: [], status: 'updating', year: 2026, language: 'zh', dramaType: 4, tagIds: [], publishStatus: 'draft', episodes: [] }

function episode(number: number, ready = false): Episode {
  return { id: `episode-${number}`, dramaId: emptyDraft.id, number, title: `测试草稿 第${number}集`, description: '', vid: ready ? `vid-${number}` : '', posterUrl: '', durationSeconds: ready ? 60 : 0, mediaStatus: ready ? 'ready' : 'pending', }
}

function setup(initial: Drama | null = emptyDraft, can = () => true) {
  let stored = initial ?? emptyDraft
  const persist = async (input: DramaInput) => {
    stored = { ...stored, ...input, publishStatus: 'draft', episodes: input.episodes.map((entry, index) => ({ ...episode(index + 1), ...stored.episodes.find((item) => item.id === entry.id), ...entry, id: entry.id || `episode-${index + 1}` })) }
    return stored
  }
  const api = {
    dramaReferenceData: vi.fn(async () => ({ schemaVersion: '1', sourceUrl: '', statuses: [{ value: 'updating', label: '更新中' }], languages: [], dramaTypes: [{ value: 4, label: '真人本地化' }], tags: [] })),
    createDrama: vi.fn(persist), updateDrama: vi.fn(async (_id: string, input: DramaInput) => persist(input)),
    findDrama: vi.fn(async () => stored),
    prepareDrama: vi.fn(async () => {
      if (stored.publishStatus !== 'ready') stored = {...stored,publishStatus:'ready'}
      return stored
    }),
    uploadCover: vi.fn(async () => ({ url: emptyDraft.coverUrl, uploadId: 'cover-once' })),
    reserveEpisodeMediaUpload: vi.fn(async (id: string) => ({ uploadId: `upload-${id}`, authorization: { mode: 'direct', maxFileBytes: 1024 } })),
    refreshEpisodeMediaUploadAuthorization: vi.fn(async () => ({ mode: 'direct', maxFileBytes: 1024 })),
    findMediaJob: vi.fn(async (): Promise<MediaJob> => ({ jobId: 'old-upload', episodeId: 'episode-1', fileName: '第1集.mp4', size: 4, status: 'failed', createdAt: '', updatedAt: '' })),
    uploadEpisodeMediaViaServer: vi.fn(async (id: string): Promise<MediaJob> => ({ jobId: `proxy-job-${id}`, episodeId: id, fileName: 'video.mp4', size: 5, remoteVid: `proxy-vid-${id}`, status: 'queued', createdAt: '', updatedAt: '' })),
    reportDirectUploadDiagnostic: vi.fn(async () => undefined),
    queueDirectEpisodeMedia: vi.fn(async (id: string): Promise<MediaJob> => ({ jobId: `job-${id}`, episodeId: id, fileName: 'video.mp4', size: 5, remoteVid: `vid-${id}`, status: 'queued', createdAt: '', updatedAt: '' })),
    retryMediaJob: vi.fn(async (id: string): Promise<MediaJob> => ({ jobId: id, episodeId: 'episode-1', fileName: 'video.mp4', size: 5, status: 'queued', createdAt: '', updatedAt: '' })),
    listDramaMediaJobs: vi.fn(async (): Promise<MediaJob[]> => []),
  }
  const upload = vi.fn(async () => ({ vid: 'direct-vid', uploadRequestId: 'request-1' }))
  const notify = vi.fn()
  const onSaved = vi.fn()
  const props = { api: api as unknown as OperationsApi, initial, userId: 'editor-test', can, notify, onSaved, onClose: vi.fn(), onDelete: vi.fn(), directUploader: { upload } }
  return { api, upload, notify, onSaved, props, read: () => stored }
}

async function choose(label: string, name = '第1集.mp4') {
  const control = await screen.findByLabelText(label)
  const input = control instanceof HTMLInputElement ? control : (control.querySelector<HTMLInputElement>('input[type="file"]') || control.closest('.ant-upload')?.querySelector<HTMLInputElement>('input[type="file"]'))
  if (!input) throw new Error(`找不到文件选择入口：${label}`)
  fireEvent.change(input, { target: { files: [new File(['file'], name, { type: name.endsWith('.png') ? 'image/png' : 'video/mp4' })] } })
}

async function chooseFile(label: string, file: File) {
  const control = await screen.findByLabelText(label)
  const input = control instanceof HTMLInputElement ? control : (control.querySelector<HTMLInputElement>('input[type="file"]') || control.closest('.ant-upload')?.querySelector<HTMLInputElement>('input[type="file"]'))
  if (!input) throw new Error(`找不到文件选择入口：${label}`)
  fireEvent.change(input, { target: { files: [file] } })
}

async function chooseFiles(label: string, files: File[]) {
  const control = await screen.findByLabelText(label)
  const input = control instanceof HTMLInputElement ? control : (control.querySelector<HTMLInputElement>('input[type="file"]') || control.closest('.ant-upload')?.querySelector<HTMLInputElement>('input[type="file"]'))
  if (!input) throw new Error(`找不到文件选择入口：${label}`)
  fireEvent.change(input, { target: { files } })
}

async function prepareStaleUpload(file: File) {
  const initial = { ...emptyDraft, episodes: [episode(1)] }
  const draft = episodeDraftsFromEpisodes(initial.episodes)[0]
  const identity = await identifyUploadFile(file)
  persistUploadBatch(window.localStorage, 'editor-test', initial.id, 'stale-batch', [{
    ...draft, expectedFileName: file.name, expectedFileSize: file.size,
    expectedFileLastModified: file.lastModified, expectedFileType: file.type,
    expectedFileFingerprint: identity.fingerprint,
    pendingUploadId: 'old-upload', uploadState: 'failed', error: '原上传失败',
  }])
  return initial
}

test.each([{ label: '桌面', width: 1440 }, { label: '手机', width: 390 }])('$label视口下旧预留失败且没有 VID 时重新预留', async ({ width }) => {
  vi.stubGlobal('innerWidth', width)
  const file = new File(['file'], '第1集.mp4', { type: 'video/mp4', lastModified: 123 })
  const ctx = setup(await prepareStaleUpload(file))
  ctx.api.refreshEpisodeMediaUploadAuthorization.mockRejectedValueOnce(new ApiError('conflict', 409, 'state_conflict'))
  render(<DramaEditor {...ctx.props} />)
  await openUploads()
  await chooseFile('重新选择第 1 集视频', file)
  fireEvent.click(await screen.findByLabelText('上传第 1 集'))
  await waitFor(() => expect(ctx.api.queueDirectEpisodeMedia).toHaveBeenCalledTimes(1))
  expect(ctx.api.findMediaJob).toHaveBeenCalledWith('old-upload')
  expect(ctx.api.reserveEpisodeMediaUpload).toHaveBeenCalledTimes(1)
  expect(ctx.upload).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('当前状态不支持此操作，或内容已重复，请刷新检查后重试')).not.toBeInTheDocument()
})

test('旧任务仍在服务端上传时接管任务进度，不重复传输或创建预留', async () => {
  const file = new File(['file'], '第1集.mp4', { type: 'video/mp4', lastModified: 123 })
  const ctx = setup(await prepareStaleUpload(file))
  ctx.api.refreshEpisodeMediaUploadAuthorization.mockRejectedValueOnce(new ApiError('conflict', 409, 'state_conflict'))
  ctx.api.findMediaJob.mockResolvedValueOnce({ jobId: 'old-upload', episodeId: 'episode-1', fileName: file.name, size: file.size, status: 'uploading', createdAt: '', updatedAt: '' })
  render(<DramaEditor {...ctx.props} />)
  await openUploads()
  await chooseFile('重新选择第 1 集视频', file)
  fireEvent.click(await screen.findByLabelText('上传第 1 集'))
  await waitFor(() => expect(screen.getAllByText('后台处理中').length).toBeGreaterThan(0))
  expect(ctx.api.reserveEpisodeMediaUpload).not.toHaveBeenCalled()
  expect(ctx.upload).not.toHaveBeenCalled()
})

test('旧任务归属其他分集时拒绝自动重新预留', async () => {
  const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const file = new File(['file'], '第1集.mp4', { type: 'video/mp4', lastModified: 123 })
  const ctx = setup(await prepareStaleUpload(file))
  ctx.api.refreshEpisodeMediaUploadAuthorization.mockRejectedValueOnce(new ApiError('conflict', 409, 'state_conflict'))
  ctx.api.findMediaJob.mockResolvedValueOnce({ jobId: 'old-upload', episodeId: 'other-episode', fileName: file.name, size: file.size, status: 'failed', createdAt: '', updatedAt: '' })
  render(<DramaEditor {...ctx.props} />)
  await openUploads()
  await chooseFile('重新选择第 1 集视频', file)
  fireEvent.click(await screen.findByLabelText('上传第 1 集'))
  await waitFor(() => expect(log).toHaveBeenCalledWith('upload episode media failed', { error: 'conflict' }))
  expect(ctx.api.reserveEpisodeMediaUpload).not.toHaveBeenCalled()
  expect(ctx.upload).not.toHaveBeenCalled()
})

test('旧预留被其他任务取代时不覆盖新预留', async () => {
  const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const file = new File(['file'], '第1集.mp4', { type: 'video/mp4', lastModified: 123 })
  const ctx = setup(await prepareStaleUpload(file))
  ctx.api.refreshEpisodeMediaUploadAuthorization.mockRejectedValueOnce(new ApiError('conflict', 409, 'state_conflict'))
  ctx.api.findMediaJob.mockResolvedValueOnce({ jobId: 'old-upload', episodeId: 'episode-1', fileName: file.name, size: file.size, status: 'failed', error: 'upload superseded', createdAt: '', updatedAt: '' })
  render(<DramaEditor {...ctx.props} />)
  await openUploads()
  await chooseFile('重新选择第 1 集视频', file)
  fireEvent.click(await screen.findByLabelText('上传第 1 集'))
  await waitFor(() => expect(log).toHaveBeenCalledWith('upload episode media failed', { error: 'conflict' }))
  expect(ctx.api.reserveEpisodeMediaUpload).not.toHaveBeenCalled()
  expect(ctx.upload).not.toHaveBeenCalled()
})

async function openUploads() {
  fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))
  await screen.findByLabelText('选择剧集视频')
}

test('审核期间仍可修改草稿和分集，保存不改变已准备版本', async () => {
  const ctx = setup({ ...emptyDraft, publishStatus: 'ready', episodes: [episode(1, true)] })
  render(<DramaEditor {...ctx.props} />)
  expect(screen.getByLabelText('短剧名称')).toBeEnabled()
  await openUploads()
  expect(screen.queryByText('本批已冻结')).not.toBeInTheDocument()
  expect(screen.getByLabelText('编辑第 1 集')).toBeEnabled()
  await choose('选择剧集视频', '第2集.mp4')
  fireEvent.click(screen.getByRole('button', { name: '开始上传（1 集）' }))
  await waitFor(() => expect(ctx.api.reserveEpisodeMediaUpload).toHaveBeenCalledWith('episode-2', expect.anything()))
  expect(ctx.api.reserveEpisodeMediaUpload).toHaveBeenCalledTimes(1)
  expect(ctx.read().publishStatus).toBe('draft')
  expect(ctx.read().episodes[0].vid).toBe('vid-1')
})

test('新建时可以保存空分集草稿，稍后进入上传且封面登记只消费一次', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const ctx = setup(null)
  render(<DramaEditor {...ctx.props} />)
  fireEvent.change(screen.getByLabelText('短剧名称'), { target: { value: '先保存的新剧' } })
  fireEvent.change(screen.getByLabelText('短剧简介'), { target: { value: '先保存的短剧简介' } })
  await choose('上传短剧封面', 'cover.png')
  fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
  await waitFor(() => expect(ctx.api.createDrama).toHaveBeenCalledWith(expect.objectContaining({ title: '先保存的新剧', episodes: [], coverUploadId: 'cover-once' })))
  await waitFor(() => expect(ctx.notify).toHaveBeenCalledWith('草稿已保存，视频可稍后上传'))
  expect(ctx.upload).not.toHaveBeenCalled()
  expect(ctx.read().title).toBe('先保存的新剧')
  await openUploads()
  await choose('选择剧集视频')
  fireEvent.click(screen.getByRole('button', { name: '开始上传（1 集）' }))
  await waitFor(() => expect(ctx.upload).toHaveBeenCalledTimes(1))
  expect(ctx.api.createDrama).toHaveBeenCalledTimes(1)
  expect(ctx.api.uploadCover).toHaveBeenCalledTimes(1)
  expect(ctx.api.updateDrama).toHaveBeenCalledWith(emptyDraft.id, expect.objectContaining({ coverUploadId: undefined, episodes: [expect.objectContaining({ number: 1 })] }))
  expect(log).not.toHaveBeenCalled()
})

test('新建短剧缺少简介时不能保存、上传封面或进入分集', async () => {
  const ctx = setup(null)
  render(<DramaEditor {...ctx.props} />)
  fireEvent.change(screen.getByLabelText('短剧名称'), { target: { value: '缺简介的新剧' } })
  await choose('上传短剧封面', 'cover.png')
  expect(screen.getByLabelText('短剧简介')).toHaveAttribute('aria-required', 'true')
  fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('请填写短剧简介')
  expect(ctx.api.uploadCover).not.toHaveBeenCalled()
  expect(ctx.api.createDrama).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('选择剧集视频')).not.toBeInTheDocument()
})

test('已有空简介草稿必须补齐简介后才能保存', async () => {
  const ctx = setup({ ...emptyDraft, description: '' })
  render(<DramaEditor {...ctx.props} />)
  fireEvent.change(screen.getByLabelText('短剧简介'), { target: { value: '   ' } })
  fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('请填写短剧简介')
  expect(ctx.api.updateDrama).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('短剧简介'), { target: { value: '补齐的短剧简介' } })
  fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
  await waitFor(() => expect(ctx.api.updateDrama).toHaveBeenCalledWith(emptyDraft.id, expect.objectContaining({ description: '补齐的短剧简介' })))
})

test('已有空简介草稿不能从分集页绕过校验上传视频', async () => {
  const ctx = setup({ ...emptyDraft, description: '', episodes: [episode(1)] })
  render(<DramaEditor {...ctx.props} />)
  fireEvent.click(screen.getByRole('tab', { name: '分集视频（1）' }))
  await choose('选择剧集视频')
  fireEvent.click(screen.getByRole('button', { name: '开始上传（1 集）' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('请填写短剧简介')
  expect(ctx.api.updateDrama).not.toHaveBeenCalled()
  expect(ctx.api.reserveEpisodeMediaUpload).not.toHaveBeenCalled()
  expect(ctx.upload).not.toHaveBeenCalled()
})

test('HTTP 页面缺少 Web Crypto 时仍能提交视频上传', async () => {
  vi.stubGlobal('crypto', {})
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const ctx = setup({ ...emptyDraft, episodes: [episode(1)] })
  render(<DramaEditor {...ctx.props} />)
  await openUploads()
  await choose('选择剧集视频')
  fireEvent.click(await screen.findByLabelText('上传第 1 集'))

  await waitFor(() => expect(ctx.upload).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(ctx.api.queueDirectEpisodeMedia).toHaveBeenCalledTimes(1))
  expect(ctx.api.reserveEpisodeMediaUpload).toHaveBeenCalledWith('episode-1', expect.any(File))
  expect(log).not.toHaveBeenCalled()
})

test('只重选第二集即可上传，第一集缺文件和第三集已成功均不参与', async () => {
  const initial = { ...emptyDraft, episodes: [episode(1), episode(2), episode(3, true)] }
  const drafts = episodeDraftsFromEpisodes(initial.episodes).map((draft, index) => index < 2 ? { ...draft, uploadState: 'failed' as const, error: '原上传失败' } : draft)
  persistUploadBatch(window.localStorage, 'editor-test', initial.id, 'test-batch', drafts)
  const ctx = setup(initial)
  render(<DramaEditor {...ctx.props} />)
  await openUploads()
  await choose('重新选择第 2 集视频', '第2集.mp4')
  fireEvent.click(await screen.findByLabelText('上传第 2 集'))
  await waitFor(() => expect(ctx.api.queueDirectEpisodeMedia).toHaveBeenCalledTimes(1))
  expect(ctx.api.reserveEpisodeMediaUpload).toHaveBeenCalledWith('episode-2', expect.any(File))
  expect(ctx.upload).toHaveBeenCalledTimes(1)
  expect(ctx.api.updateDrama).not.toHaveBeenCalled()
  expect(screen.getByLabelText('重新选择第 1 集视频')).toBeInTheDocument()
  expect(screen.getByText('已就绪')).toBeInTheDocument()
  expect((await screen.findAllByText('后台处理中')).length).toBeGreaterThan(0)
})

test('离开编辑页后直传完成仍确认服务端任务并保留恢复快照', async () => {
  const ctx = setup({ ...emptyDraft, episodes: [episode(1)] })
  let finishUpload!: (value: { vid: string; uploadRequestId: string }) => void
  ctx.upload.mockImplementationOnce(() => new Promise((resolve) => { finishUpload = resolve }))
  const view = render(<DramaEditor {...ctx.props} />)
  await openUploads()
  await choose('选择剧集视频')
  fireEvent.click(screen.getByRole('button', { name: '开始上传（1 集）' }))
  await waitFor(() => expect(finishUpload).toBeTypeOf('function'))
  view.unmount()
  finishUpload({ vid: 'direct-vid', uploadRequestId: 'request-1' })
  await waitFor(() => expect(ctx.api.queueDirectEpisodeMedia).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(restoreUploadBatch(window.localStorage, 'editor-test', emptyDraft.id, episodeDraftsFromEpisodes([episode(1)]))?.episodes[0]).toMatchObject({
    pendingVid: 'direct-vid', mediaJobId: 'job-episode-1', uploadState: 'processing',
  }))
})

test('浏览器合并失败时保留直传诊断和单集重试，不提交媒资任务', async () => {
  const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const initial = { ...emptyDraft, episodes: [episode(1)] }
  const ctx = setup(initial)
  ctx.upload.mockRejectedValueOnce(new DirectUploadError('BytePlus VOD 上传失败，请稍后重试', {
    stage: 'fileMerge', code: '4025', status: 0, reason: 'merge file error already existed',
  }))
  render(<DramaEditor {...ctx.props} />)
  await openUploads()
  await choose('选择剧集视频')
  fireEvent.click(await screen.findByLabelText('上传第 1 集'))
  await waitFor(() => expect(ctx.api.reportDirectUploadDiagnostic).toHaveBeenCalledWith('episode-1', 'upload-episode-1', {
    stage: 'fileMerge', code: '4025', status: 0, reason: 'merge file error already existed',
  }))
  await screen.findByLabelText('重试第 1 集')
  expect(ctx.api.queueDirectEpisodeMedia).not.toHaveBeenCalled()
  expect(ctx.api.uploadEpisodeMediaViaServer).not.toHaveBeenCalled()
  expect(log).toHaveBeenCalledWith('upload episode media failed', { error: 'BytePlus VOD 上传失败，请稍后重试' })
})

test('直传失败且诊断上报失败时记录脱敏错误，不泄露凭据或媒体地址', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const ctx = setup({ ...emptyDraft, episodes: [episode(1)] })
  ctx.upload.mockRejectedValueOnce(new DirectUploadError('BytePlus VOD 上传失败，请稍后重试', {
    stage: 'initUploadID', code: '1002', status: 0, reason: 'request fail',
  }))
  ctx.api.reportDirectUploadDiagnostic.mockRejectedValueOnce(new Error('diagnostic unavailable token=hidden https://media.example/video'))
  render(<DramaEditor {...ctx.props} />)
  await openUploads()
  await choose('选择剧集视频')
  fireEvent.click(await screen.findByLabelText('上传第 1 集'))
  await waitFor(() => expect(warning).toHaveBeenCalledWith('upload episode media failed', { error: 'BytePlus VOD 上传失败，请稍后重试' }))
  expect(ctx.api.reportDirectUploadDiagnostic).toHaveBeenCalledTimes(1)
  expect(log).toHaveBeenCalledWith('report direct media upload diagnostic failed', { error: 'diagnostic unavailable token=[已脱敏] [URL 已脱敏]' })
  expect(ctx.api.queueDirectEpisodeMedia).not.toHaveBeenCalled()
  expect(ctx.api.uploadEpisodeMediaViaServer).not.toHaveBeenCalled()
})

test.each([{ label: '桌面', width: 1440 }, { label: '手机', width: 390 }])('$label视口下所选六集同时启动直传', async ({ width }) => {
  vi.stubGlobal('innerWidth', width)
  const ctx = setup({ ...emptyDraft, episodes: Array.from({ length: 6 }, (_, index) => episode(index + 1)) })
  const finishUploads: Array<(value: { vid: string; uploadRequestId: string }) => void> = []
  ctx.upload.mockImplementation(() => new Promise((resolve) => { finishUploads.push(resolve) }))
  render(<DramaEditor {...ctx.props} />)
  await openUploads()
  await chooseFiles('选择剧集视频', Array.from({ length: 6 }, (_, index) => new File(['file'], `第${index + 1}集.mp4`, { type: 'video/mp4' })))
  fireEvent.click(screen.getByRole('button', { name: '开始上传（6 集）' }))
  await waitFor(() => expect(ctx.upload).toHaveBeenCalledTimes(6))
  expect(finishUploads).toHaveLength(6)
  for (const finish of finishUploads) finish({ vid: 'direct-vid', uploadRequestId: 'request-1' })
  await waitFor(() => expect(ctx.api.queueDirectEpisodeMedia).toHaveBeenCalledTimes(6))
  expect(ctx.api.uploadEpisodeMediaViaServer).not.toHaveBeenCalled()
})

test('确认失败后单集重试复用 VID，不再次保存资料、上传文件或申请授权', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const ctx = setup({ ...emptyDraft, episodes: [episode(1), episode(2)] })
  ctx.api.queueDirectEpisodeMedia.mockRejectedValueOnce(new Error('confirmation timeout token=hidden https://media.example/video'))
  render(<DramaEditor {...ctx.props} />)
  await openUploads()
  await choose('重新选择第 1 集视频')
  fireEvent.click(await screen.findByLabelText('上传第 1 集'))
  const retry = await screen.findByLabelText('重试第 1 集')
  await waitFor(() => expect(retry).toBeEnabled())
  expect(retry).toHaveTextContent('继续确认')
  fireEvent.click(retry)
  await waitFor(() => expect(ctx.api.queueDirectEpisodeMedia).toHaveBeenCalledTimes(2))
  expect(ctx.upload).toHaveBeenCalledTimes(1)
  expect(ctx.api.reserveEpisodeMediaUpload).toHaveBeenCalledTimes(1)
  expect(ctx.api.updateDrama).not.toHaveBeenCalled()
  expect(log).toHaveBeenCalledWith('upload episode media failed', { error: 'confirmation timeout token=[已脱敏] [URL 已脱敏]' })
})

test('仅有资料编辑权限时仍可保存，保存失败保留输入并记录实际错误', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const ctx = setup(emptyDraft, (permission?: string) => permission !== permissionCodes.mediaUpload)
  ctx.api.updateDrama.mockRejectedValueOnce(new Error('draft database unavailable'))
  render(<DramaEditor {...ctx.props} />)
  fireEvent.change(screen.getByLabelText('短剧名称'), { target: { value: '修改后的名字' } })
  fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('操作失败，请稍后重试')
  expect(screen.getByLabelText('短剧名称')).toHaveValue('修改后的名字')
  expect(log).toHaveBeenCalledWith('save drama draft failed', { error: 'draft database unavailable' })
  fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
  await waitFor(() => expect(ctx.notify).toHaveBeenCalledWith('草稿已保存，视频可稍后上传'))
  expect(ctx.read().title).toBe('修改后的名字')
  expect(ctx.upload).not.toHaveBeenCalled()
  expect(ctx.api.uploadCover).not.toHaveBeenCalled()
})

test('已取得 VOD VID 的服务端处理失败可直接重试一集，其他缺文件的分集不阻塞', async () => {
  const initial = { ...emptyDraft, episodes: [episode(1), episode(2)] }
  const ctx = setup(initial)
  ctx.api.listDramaMediaJobs.mockResolvedValue([{ jobId: 'job-failed', episodeId: 'episode-1', fileName: 'video.mp4', size: 5, remoteVid: 'vid-failed', status: 'failed', error: '处理失败', createdAt: '', updatedAt: '' }])
  render(<DramaEditor {...ctx.props} />)
  await openUploads()
  fireEvent.click(await screen.findByLabelText('重试第 1 集'))
  await waitFor(() => expect(ctx.api.retryMediaJob).toHaveBeenCalledWith('job-failed'))
  expect(ctx.upload).not.toHaveBeenCalled()
  expect(ctx.api.updateDrama).not.toHaveBeenCalled()
})

test('未取得 VOD VID 的失败任务只提供重新选文件，不请求处理重试', async () => {
  const initial = { ...emptyDraft, episodes: [episode(1)] }
  const ctx = setup(initial)
  ctx.api.listDramaMediaJobs.mockResolvedValue([{ jobId: 'job-upload-failed', episodeId: 'episode-1', fileName: 'video.mp4', size: 5, status: 'failed', error: '上传失败', createdAt: '', updatedAt: '' }])
  render(<DramaEditor {...ctx.props} />)
  await openUploads()
  expect(screen.getByText('视频尚未上传成功，请重新选择视频上传')).toBeInTheDocument()
  expect(screen.queryByLabelText('重试第 1 集')).not.toBeInTheDocument()
  expect(screen.getByLabelText('重新选择第 1 集视频')).toBeInTheDocument()
  expect(ctx.api.retryMediaJob).not.toHaveBeenCalled()
})

test('读取引用数据失败有日志，预期的权限拒绝使用警告且不显示原始异常', async () => {
  const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const ctx = setup()
  ctx.api.dramaReferenceData.mockRejectedValue(new ApiError('没有读取权限', 403))
  render(<DramaEditor {...ctx.props} />)
  expect(await screen.findByText('短剧元数据加载失败：你暂无此操作权限，请联系管理员开通')).toBeInTheDocument()
  expect(log).toHaveBeenCalledWith('load drama metadata failed', { error: '没有读取权限' })
})

test('封面上传失败保留选择并允许重试，轮询故障记录实际错误', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const ctx = setup({ ...emptyDraft, coverUrl: '' })
  ctx.api.listDramaMediaJobs.mockRejectedValueOnce(new Error('media jobs unavailable'))
  ctx.api.uploadCover.mockRejectedValueOnce(new Error('cover upstream timeout'))
  render(<DramaEditor {...ctx.props} />)
  await waitFor(() => expect(log).toHaveBeenCalledWith('refresh drama media jobs failed', { error: 'media jobs unavailable' }))
  await choose('上传短剧封面', 'cover.png')
  fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
  await waitFor(() => expect(log).toHaveBeenCalledWith('upload drama cover failed', { error: 'cover upstream timeout' }))
  expect(ctx.api.updateDrama).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
  await waitFor(() => expect(ctx.notify).toHaveBeenCalledWith('草稿已保存，视频可稍后上传'))
  expect(ctx.api.uploadCover).toHaveBeenCalledTimes(2)
})

test('删除草稿失败有可定位日志并保留确认框供重试', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const ctx = setup()
  ctx.props.onDelete.mockRejectedValue(new Error('delete database unavailable'))
  render(<DramaEditor {...ctx.props} />)
  fireEvent.click(screen.getByLabelText('删除短剧'))
  fireEvent.click(await screen.findByText(/^删\s*除$/, { selector: 'button span' }))
  await waitFor(() => expect(log).toHaveBeenCalledWith('delete drama draft failed', { error: 'delete database unavailable' }))
  expect(screen.getByText('确认永久删除“测试草稿”及其全部分集？')).toBeInTheDocument()
  expect(ctx.props.onClose).not.toHaveBeenCalled()
})

test('草稿短剧提供可见的删除入口', () => {
  const ctx = setup()
  render(<DramaEditor {...ctx.props} />)
  expect(screen.getAllByRole('button', { name: '删除短剧' })).toHaveLength(1)
})

test('视频就绪后提示返回列表确认就绪，编辑页不操作渠道发布', async () => {
  const readyDrama = { ...emptyDraft, episodes: [episode(1, true), episode(2, true)] }
  const ctx = setup(readyDrama)
  render(<DramaEditor {...ctx.props} />)
  fireEvent.click(screen.getByRole('tab', { name: '分集视频（2）' }))
  expect(await screen.findByText('全部视频已就绪')).toBeInTheDocument()
  expect(screen.getByText('返回短剧列表可直接上线直连内容，或进入官方发布流程。')).toBeInTheDocument()
  expect(screen.queryByText('发布准备')).not.toBeInTheDocument()
  expect(screen.queryByText('发布工作台')).not.toBeInTheDocument()
  expect(screen.queryByText('确认待上线')).not.toBeInTheDocument()
})

test('已同步内容的草稿仍可编辑，修改确认待上线后仍不生成版本', async () => {
  const ctx = setup({ ...emptyDraft, publishStatus: 'publishing', episodes: [episode(1, true)] })
  render(<DramaEditor {...ctx.props} />)
  expect(screen.queryByText('确认待上线')).not.toBeInTheDocument()
  const title = screen.getByLabelText('短剧名称')
  expect(title).toBeEnabled()
  fireEvent.change(title, { target: { value: '送审前修改的名称' } })
  fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
  await waitFor(() => expect(ctx.api.updateDrama).toHaveBeenCalled())
})

test('审核驳回后可以修改并保存，不再被发布锁阻止', async () => {
  const ctx = setup({ ...emptyDraft, publishStatus: 'rejected', episodes: [episode(1, true)] })
  render(<DramaEditor {...ctx.props} />)
  expect(screen.queryByText('审核未通过，请按审核意见修改。')).not.toBeInTheDocument()
  expect(screen.getByLabelText('短剧名称')).toBeEnabled()
  fireEvent.change(screen.getByLabelText('短剧名称'), { target: { value: '按意见修正' } })
  fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
  await waitFor(() => expect(ctx.api.updateDrama).toHaveBeenCalled())
})

test('编辑页保存修改仅更新草稿，不确认就绪或生成发布版本', async () => {
 const ctx = setup({...emptyDraft, publishStatus: 'ready', episodes:[episode(1,true)]})
 render(<DramaEditor {...ctx.props} />)
 expect(screen.queryByText('确认待上线')).not.toBeInTheDocument()
 expect(screen.queryByText('发布工作台')).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('短剧名称'),{target:{value:'新内容标题'}})
 fireEvent.click(screen.getByRole('button',{name:'保存草稿'}))
 await waitFor(()=>expect(ctx.api.updateDrama).toHaveBeenCalledOnce())
 expect(ctx.api.prepareDrama).not.toHaveBeenCalled()
 expect(ctx.read()).not.toHaveProperty('contentVersion')
 expect(ctx.read()).not.toHaveProperty('contentVersionId')
})
