import type { EpisodeDraft, EpisodeUploadState } from './episodeDraft'
import { reportDramaFailure } from './dramaEditorErrors'

const snapshotVersion = 2
const snapshotMaxAgeMs = 30 * 24 * 60 * 60 * 1000

interface UploadBatchItem {
  clientId: string
  episodeId?: string
  number: number
  fileName?: string
  fileSize?: number
  fileLastModified?: number
  fileType?: string
  fileFingerprint?: string
  pendingVid: string
  pendingUploadId?: string
  pendingUploadRequestId: string
  mediaJobId?: string
  uploadState: EpisodeUploadState
  progress: number
  error: string
}

interface UploadBatchSnapshot {
  version: typeof snapshotVersion
  batchId: string
  dramaId: string
  updatedAt: string
  items: UploadBatchItem[]
}

// RestoredUploadBatch 结合已保存的进度和服务端分集恢复可继续的任务。
export interface RestoredUploadBatch {
  // batchId 是浏览器批次标识，不是服务端上传授权。
  batchId: string
  // episodes 以当前服务端分集为准，不恢复已删除的分集。
  episodes: EpisodeDraft[]
  // interruptedCount 表示刷新前仍依赖本地文件的分集数量。
  interruptedCount: number
}

// createUploadBatchId 为当前浏览器中的一批文件生成追踪标识。
export function createUploadBatchId(): string {
  return crypto.randomUUID?.() || `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// persistUploadBatch 保存恢复所需的非文件信息；存储失败不阻断当前上传。
export function persistUploadBatch(storage: Storage, userId: string, dramaId: string, batchId: string, episodes: EpisodeDraft[]): void {
  if (!dramaId || episodes.length === 0) return
  if (episodes.every((episode) => episode.uploadState === 'ready')) {
    clearUploadBatch(storage, userId, dramaId)
    return
  }

  const snapshot: UploadBatchSnapshot = {
    version: snapshotVersion,
    batchId,
    dramaId,
    updatedAt: new Date().toISOString(),
    items: episodes.map((episode) => ({
      clientId: episode.clientId,
      episodeId: episode.id,
      number: episode.number,
      fileName: episode.file?.name || episode.expectedFileName,
      fileSize: episode.file?.size || episode.expectedFileSize,
      fileLastModified: episode.file?.lastModified || episode.expectedFileLastModified,
      fileType: episode.file?.type ?? episode.expectedFileType,
      fileFingerprint: episode.expectedFileFingerprint,
      pendingVid: episode.pendingVid,
      pendingUploadId: episode.pendingUploadId,
      pendingUploadRequestId: episode.pendingUploadRequestId,
      mediaJobId: episode.mediaJobId,
      uploadState: episode.uploadState,
      progress: episode.progress,
      error: episode.error,
    })),
  }
  try {
    storage.setItem(uploadBatchStorageKey(userId, dramaId), JSON.stringify(snapshot))
  } catch (error) {
    // 浏览器禁用或耗尽本地存储时，上传流程本身仍可继续。
    reportDramaFailure('persist upload batch failed', error)
  }
}

// patchUploadBatchAfterTransfer 在页面可能已经卸载时直接保存 VOD 回执与服务端登记结果。
// 只更新同一管理员、短剧、批次及分集的快照，不能把迟到回调写进新批次。
export function patchUploadBatchAfterTransfer(
  storage: Storage, userId: string, dramaId: string, batchId: string, episode: EpisodeDraft,
  patch: Partial<UploadBatchItem>,
): void {
  try {
    const key = uploadBatchStorageKey(userId, dramaId)
    const raw = storage.getItem(key)
    if (!raw) return
    const snapshot = JSON.parse(raw) as UploadBatchSnapshot
    if (snapshot.version !== snapshotVersion || snapshot.batchId !== batchId || snapshot.dramaId !== dramaId || !Array.isArray(snapshot.items)) return
    const index = snapshot.items.findIndex((item) => sameEpisode(episode, item))
    if (index < 0) return
    snapshot.items[index] = { ...snapshot.items[index], ...patch }
    snapshot.updatedAt = new Date().toISOString()
    storage.setItem(key, JSON.stringify(snapshot))
  } catch (error) {
    reportDramaFailure('patch upload batch transfer result failed', error)
  }
}

// restoreUploadBatch 按管理员和短剧读取进度，保留服务端已就绪媒资；本地文件需重新选择。
export function restoreUploadBatch(storage: Storage, userId: string, dramaId: string, episodes: EpisodeDraft[]): RestoredUploadBatch | null {
  const key = uploadBatchStorageKey(userId, dramaId)
  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch (error) {
    reportDramaFailure('read upload batch failed', error)
    return null
  }
  if (!raw) return null

  let snapshot: UploadBatchSnapshot
  try {
    snapshot = JSON.parse(raw) as UploadBatchSnapshot
  } catch (error) {
    reportDramaFailure('parse upload batch failed', error)
    clearUploadBatch(storage, userId, dramaId)
    return null
  }
  const updatedAt = Date.parse(snapshot.updatedAt)
  if (snapshot.version !== snapshotVersion || snapshot.dramaId !== dramaId || !snapshot.batchId
    || !Array.isArray(snapshot.items) || !Number.isFinite(updatedAt) || Date.now() - updatedAt > snapshotMaxAgeMs) {
    clearUploadBatch(storage, userId, dramaId)
    return null
  }

  let interruptedCount = 0
  const restored = episodes.map<EpisodeDraft>((episode) => {
    if (episode.uploadState === 'ready' && episode.vid) return episode
    const item = snapshot.items.find((candidate) => sameEpisode(episode, candidate))
    if (!item) return episode

    const common: EpisodeDraft = {
      ...episode,
      expectedFileName: item.fileName,
      expectedFileSize: item.fileSize,
      expectedFileLastModified: item.fileLastModified,
      expectedFileType: item.fileType,
      expectedFileFingerprint: item.fileFingerprint,
      pendingVid: item.pendingVid || '',
      pendingUploadId: item.pendingUploadId,
      pendingUploadRequestId: item.pendingUploadRequestId || '',
      mediaJobId: item.mediaJobId,
      progress: Math.max(0, Math.min(100, item.progress || 0)),
      error: item.error || '',
    }
    if (item.mediaJobId && item.uploadState !== 'failed') {
      return { ...common, uploadState: 'processing', progress: 100, error: '' }
    }
    if (item.uploadState === 'failed') return { ...common, uploadState: 'failed' }
    if (item.pendingUploadId && item.pendingVid && item.fileName && (item.fileSize ?? 0) > 0) {
      return { ...common, uploadState: 'failed', error: '视频已上传，点击此分集的继续确认即可恢复' }
    }
    if (item.uploadState === 'waiting' || item.uploadState === 'uploading') {
      interruptedCount += 1
      return {
        ...common,
        uploadState: 'failed',
        error: `页面关闭后需重新选择本地文件。可在上方批量重选文件${item.fileName ? `，或在本行选择「${item.fileName}」` : ''}`,
      }
    }
    return common
  })

  return { batchId: snapshot.batchId, episodes: restored, interruptedCount }
}

function sameEpisode(episode: EpisodeDraft, candidate: UploadBatchItem): boolean {
  // 服务端剧集 ID 是最强身份。一旦两边都存在且不同，禁止再按临时 ID 或集数回退，
  // 否则删除并重建同集数剧集后会把旧 Vid 错绑到新剧集。
  if (episode.id && candidate.episodeId) return episode.id === candidate.episodeId
  if (episode.clientId && candidate.clientId && episode.clientId === candidate.clientId) return true
  return candidate.number === episode.number
}

// clearUploadBatch 清除指定管理员和短剧的进度；失败不影响服务端数据。
export function clearUploadBatch(storage: Storage, userId: string, dramaId: string): void {
  try {
    storage.removeItem(uploadBatchStorageKey(userId, dramaId))
  } catch (error) {
    // 与写入一致：清理失败不阻断业务操作。
    reportDramaFailure('clear upload batch failed', error)
  }
}

// uploadBatchStorageKey 对字符串标识编码，隔离不同管理员与短剧的本地进度。
export function uploadBatchStorageKey(userId: string, dramaId: string): string {
  return `drama:episode-upload-batch:${encodeURIComponent(userId)}:${encodeURIComponent(dramaId)}`
}
