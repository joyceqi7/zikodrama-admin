import type { MediaUploadAuthorization } from '../domain'
import type { DirectMediaUploader, DirectUploadResult } from './byteplusUploader'

// UploadActivity 是全局外壳可展示的单文件传输快照，不包含文件内容、地址或授权凭据。
export interface UploadActivity {
  // id 是当前标签页内的临时任务标识。
  id: string
  // fileName 仅用于让运营识别正在上传的文件。
  fileName: string
  // progress 是 0 至 100 的文件传输百分比。
  progress: number
  // status 区分仍需保持标签页打开的上传与已结束状态。
  status: 'uploading' | 'succeeded' | 'failed'
}

// UploadActivityStore 把 SDK 生命周期收进全局模块，使页面卸载不影响任务和进度订阅。
export interface UploadActivityStore {
  // uploader 是业务页面唯一使用的受跟踪直传适配器。
  uploader: DirectMediaUploader
  // snapshot 返回当前标签页内的全部传输任务。
  snapshot(): UploadActivity[]
  // subscribe 在任务或进度变化时通知全局外壳。
  subscribe(listener: () => void): () => void
}

// createUploadActivityStore 用一个小接口隐藏任务追踪、进度合并和终态清理。
export function createUploadActivityStore(delegate: DirectMediaUploader): UploadActivityStore {
  const activities = new Map<string, UploadActivity>()
  const listeners = new Set<() => void>()
  let currentSnapshot: UploadActivity[] = []
  const emit = () => {
    currentSnapshot = [...activities.values()]
    listeners.forEach((listener) => listener())
  }
  const patch = (id: string, value: Partial<UploadActivity>) => {
    const current = activities.get(id)
    if (!current) return
    activities.set(id, { ...current, ...value })
    emit()
  }

  const uploader: DirectMediaUploader = {
    upload(file: File, authorization: MediaUploadAuthorization, userId: string, onProgress: (progress: number) => void): Promise<DirectUploadResult> {
      const id = crypto.randomUUID?.() || `direct-upload-${Date.now()}-${Math.random().toString(16).slice(2)}`
      activities.set(id, { id, fileName: file.name, progress: 0, status: 'uploading' })
      emit()
      return delegate.upload(file, authorization, userId, (progress) => {
        patch(id, { progress: Math.max(0, Math.min(100, Math.round(progress))) })
        onProgress(progress)
      }).then((result) => {
        patch(id, { progress: 100, status: 'succeeded' })
        window.setTimeout(() => {
          activities.delete(id)
          emit()
        }, 5_000)
        return result
      }).catch((error: unknown) => {
        patch(id, { status: 'failed' })
        window.setTimeout(() => {
          activities.delete(id)
          emit()
        }, 10_000)
        throw error
      })
    },
  }

  return {
    uploader,
    snapshot: () => currentSnapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
