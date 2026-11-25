import { expect, test, vi } from 'vitest'
import type { DirectMediaUploader } from './byteplusUploader'
import { createUploadActivityStore } from './uploadActivity'

test('全局上传活动在页面调用方结束后仍独立发布进度和终态', async () => {
  vi.useFakeTimers()
  let resolveUpload!: (value: { vid: string; uploadRequestId: string }) => void
  let reportProgress!: (progress: number) => void
  const delegate: DirectMediaUploader = {
    upload: (_file, _authorization, _userId, onProgress) => {
      reportProgress = onProgress
      return new Promise((resolve) => { resolveUpload = resolve })
    },
  }
  const store = createUploadActivityStore(delegate)
  const changed = vi.fn()
  store.subscribe(changed)

  const upload = store.uploader.upload(new File(['video'], 'episode.mp4'), { mode: 'direct', maxFileBytes: 100 }, 'user-1', vi.fn())
  reportProgress(37)

  expect(store.snapshot()).toMatchObject([{ fileName: 'episode.mp4', progress: 37, status: 'uploading' }])
  resolveUpload({ vid: 'vid-1', uploadRequestId: 'request-1' })
  await expect(upload).resolves.toEqual({ vid: 'vid-1', uploadRequestId: 'request-1' })
  expect(store.snapshot()[0]).toMatchObject({ progress: 100, status: 'succeeded' })
  await vi.advanceTimersByTimeAsync(5_000)
  expect(store.snapshot()).toEqual([])
  expect(changed).toHaveBeenCalled()
  vi.useRealTimers()
})
