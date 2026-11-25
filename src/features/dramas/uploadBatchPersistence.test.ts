import { expect, test, vi } from 'vitest'
import type { EpisodeDraft } from './episodeDraft'
import { clearUploadBatch, patchUploadBatchAfterTransfer, persistUploadBatch, restoreUploadBatch, uploadBatchStorageKey } from './uploadBatchPersistence'

test('页面卸载后的 VOD 回执直接写入原批次，账号或新批次不被污染', () => {
  const storage = memoryStorage()
  const draft = pendingDraft({ expectedFileName: '01.mp4', expectedFileSize: 2048, uploadState: 'uploading' })
  persistUploadBatch(storage, 'user-1', 'drama-1', 'batch-1', [draft])
  patchUploadBatchAfterTransfer(storage, 'user-1', 'drama-1', 'batch-1', draft, {
    pendingUploadId: 'asset-1', pendingVid: 'vid-1', pendingUploadRequestId: 'request-1', progress: 100,
  })
  patchUploadBatchAfterTransfer(storage, 'user-1', 'drama-1', 'other-batch', draft, { pendingVid: 'wrong' })
  patchUploadBatchAfterTransfer(storage, 'user-2', 'drama-1', 'batch-1', draft, { pendingVid: 'wrong' })
  expect(restoreUploadBatch(storage, 'user-1', 'drama-1', [pendingDraft()])?.episodes[0]).toMatchObject({
    pendingVid: 'vid-1', pendingUploadId: 'asset-1', uploadState: 'failed',
  })
})

test('页面刷新后恢复已经进入后台处理的上传项', () => {
  const storage = memoryStorage()
  const draft = pendingDraft({
    mediaJobId: 'job-1', pendingUploadId: 'asset-1', pendingVid: 'vid-1', pendingUploadRequestId: 'request-1',
    expectedFileName: '01.mp4', expectedFileSize: 2048, uploadState: 'processing', progress: 100,
  })
  persistUploadBatch(storage, 'user-1', 'drama-1', 'batch-1', [draft])

  const restored = restoreUploadBatch(storage, 'user-1', 'drama-1', [pendingDraft()])

  expect(restored).toMatchObject({
    batchId: 'batch-1', interruptedCount: 0,
    episodes: [{ mediaJobId: 'job-1', pendingVid: 'vid-1', uploadState: 'processing', expectedFileName: '01.mp4' }],
  })
})

test('VOD 已上传但 API 未确认时保留 Vid 和文件元数据以便继续确认', () => {
  const storage = memoryStorage()
  const draft = pendingDraft({
    pendingUploadId: 'asset-1', pendingVid: 'vid-1', pendingUploadRequestId: 'request-1',
    expectedFileName: '01.mp4', expectedFileSize: 2048, uploadState: 'uploading', progress: 90,
  })
  persistUploadBatch(storage, 'user-1', 'drama-1', 'batch-1', [draft])

  const restored = restoreUploadBatch(storage, 'user-1', 'drama-1', [pendingDraft()])

  expect(restored?.episodes[0]).toMatchObject({
    pendingUploadId: 'asset-1', pendingVid: 'vid-1', expectedFileName: '01.mp4', expectedFileSize: 2048,
    uploadState: 'failed', error: '视频已上传，点击此分集的继续确认即可恢复',
  })
})

test('浏览器无法恢复本地 File 时引导批量补选未完成视频', () => {
  const storage = memoryStorage()
  const draft = pendingDraft({
    file: new File(['video'], '第01集.mp4', { type: 'video/mp4' }), uploadState: 'uploading', progress: 36,
  })
  persistUploadBatch(storage, 'user-1', 'drama-1', 'batch-1', [draft])

  const restored = restoreUploadBatch(storage, 'user-1', 'drama-1', [pendingDraft()])

  expect(restored).toMatchObject({ interruptedCount: 1 })
  expect(restored?.episodes[0]).toMatchObject({
    expectedFileName: '第01集.mp4', uploadState: 'failed', progress: 36,
  })
  expect(restored?.episodes[0].error).toContain('可在上方批量重选文件')
  expect(restored?.episodes[0].error).toContain('或在本行选择「第01集.mp4」')
})

test('批次全部就绪后自动清理快照', () => {
  const storage = memoryStorage()
  storage.setItem(uploadBatchStorageKey('user-1', 'drama-1'), 'stale')
  persistUploadBatch(storage, 'user-1', 'drama-1', 'batch-1', [{
    ...pendingDraft(), vid: 'vid-ready', uploadState: 'ready', progress: 100,
  }])

  expect(storage.getItem(uploadBatchStorageKey('user-1', 'drama-1'))).toBeNull()
  clearUploadBatch(storage, 'user-1', 'drama-1')
})

test('同集数但服务端剧集 ID 不同时不恢复旧媒资', () => {
  const storage = memoryStorage()
  persistUploadBatch(storage, 'user-1', 'drama-1', 'batch-1', [pendingDraft({
    id: 'episode-old',
    clientId: 'shared-client-id',
    pendingUploadId: 'asset-old',
    pendingVid: 'vid-old',
    pendingUploadRequestId: 'request-old',
    expectedFileName: '01.mp4',
    expectedFileSize: 2048,
    uploadState: 'processing',
    progress: 100,
  })])

  const restored = restoreUploadBatch(storage, 'user-1', 'drama-1', [pendingDraft({
    id: 'episode-new',
    clientId: 'shared-client-id',
    number: 1,
  })])

  expect(restored?.episodes[0]).toMatchObject({
    id: 'episode-new',
    pendingVid: '',
    uploadState: 'missing',
  })
})

test('本地存储故障保留当前业务结果，并记录失败操作与脱敏后的实际错误', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    const storage = memoryStorage()
    storage.setItem = () => { throw new Error('quota exceeded token=private') }
    expect(() => persistUploadBatch(storage, 'u', 'd', 'b', [pendingDraft()])).not.toThrow()
    expect(log).toHaveBeenLastCalledWith('persist upload batch failed', { error: 'quota exceeded token=[已脱敏]' })
    storage.getItem = () => { throw new Error('storage access denied') }
    expect(restoreUploadBatch(storage, 'u', 'd', [pendingDraft()])).toBeNull()
    expect(log).toHaveBeenLastCalledWith('read upload batch failed', { error: 'storage access denied' })
    storage.removeItem = () => { throw new Error('storage cleanup denied') }
    expect(() => clearUploadBatch(storage, 'u', 'd')).not.toThrow()
    expect(log).toHaveBeenLastCalledWith('clear upload batch failed', { error: 'storage cleanup denied' })
    storage.removeItem = vi.fn()
    storage.getItem = () => 'invalid-json'
    expect(restoreUploadBatch(storage, 'u', 'd', [pendingDraft()])).toBeNull()
    expect(log).toHaveBeenLastCalledWith('parse upload batch failed', { error: expect.stringContaining('Unexpected token') })
    expect(storage.removeItem).toHaveBeenCalledWith(uploadBatchStorageKey('u', 'd'))
  } finally { log.mockRestore() }
})

function pendingDraft(patch: Partial<EpisodeDraft> = {}): EpisodeDraft {
  return {
    clientId: 'episode-1', id: 'episode-1', number: 1, title: '第 1 集', description: '',
    posterUrl: '', durationSeconds: 0, vid: '', pendingVid: '', pendingUploadRequestId: '',
    uploadState: 'missing', progress: 0, error: '', autoTitle: false, ...patch,
  }
}

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}
