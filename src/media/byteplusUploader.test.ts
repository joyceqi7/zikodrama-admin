import { afterEach, expect, test, vi } from 'vitest'
import type { FileOption, Options } from '@byteplus/uploader'
import type { MediaUploadAuthorization } from '../domain'
import { createBytePlusUploader } from './byteplusUploader'

type BytePlusInitConfig = Options & { region: string }

class FakeUploader {
  static config: BytePlusInitConfig | null = null
  static initConfigs: BytePlusInitConfig[] = []
  static preUploadInfo: Record<string, unknown> | null = null
  static file: FileOption | null = null
  static shouldFail = false
  static startError: Error | null = null
  static missingVID = false
  static failureInfo: Record<string, unknown> | null = null
  static initialFailuresRemaining = 0
  static interruptedFailuresRemaining = 0
  static resumedTaskCancelled = false
  static startCount = 0
  static pausedKey = ''
  private readonly listeners = new Map<string, (info: Record<string, unknown>) => void>()

  constructor(config: BytePlusInitConfig) {
    FakeUploader.config = config
    FakeUploader.initConfigs.push(config)
  }

  addFile(options: FileOption): string {
    FakeUploader.file = options
    return 'upload-key-1'
  }

  start(key?: string): void {
    FakeUploader.startCount += 1
    if (FakeUploader.startError) throw FakeUploader.startError
    if (FakeUploader.resumedTaskCancelled) return
    if (FakeUploader.preUploadInfo) this.listeners.get('preUpload')?.({ ...FakeUploader.preUploadInfo, key })
    if (FakeUploader.initialFailuresRemaining > 0) {
      FakeUploader.initialFailuresRemaining -= 1
      this.listeners.get('error')?.({ key, stage: 'initUploadID', res: { status: 0 }, extra: { message: 'request fail: ERR_CONNECTION_RESET' } })
      return
    }
    if (FakeUploader.interruptedFailuresRemaining > 0) {
      FakeUploader.interruptedFailuresRemaining -= 1
      this.listeners.get('error')?.({ key, stage: 'uploadSlice', isBreak: true, res: { status: 0 }, extra: { errorCode: 'NetworkError', message: 'connection reset' } })
      // SDK 在广播缓存续传失败后取消原任务，后续 start(key) 不再产生事件。
      FakeUploader.resumedTaskCancelled = true
      return
    }
    if (FakeUploader.shouldFail) {
      this.listeners.get('error')?.({ key, ...(FakeUploader.failureInfo ?? { stage: 'process', extra: { errorCode: 'NetworkError' } }) })
      return
    }
    this.listeners.get('progress')?.({ key, percent: 40.4 })
    this.listeners.get('complete')?.({ key, uploadResult: { Vid: FakeUploader.missingVID ? '' : 'vid-1', RequestId: 'request-1' } })
  }

  static cancelledKey = ''

  pause(key?: string): void {
    FakeUploader.pausedKey = key ?? ''
  }

  cancel(key?: string): void {
    FakeUploader.cancelledKey = key ?? ''
  }

  on(eventName: 'complete' | 'error' | 'progress' | 'preUpload', callback: (info: Record<string, unknown>) => void): void {
    this.listeners.set(eventName, callback)
  }

  removeAllListeners(eventName: 'complete' | 'error' | 'progress' | 'preUpload'): void {
    this.listeners.delete(eventName)
  }
}

afterEach(() => {
  FakeUploader.config = null
  FakeUploader.initConfigs = []
  FakeUploader.preUploadInfo = null
  FakeUploader.file = null
  FakeUploader.shouldFail = false
  FakeUploader.startError = null
  FakeUploader.missingVID = false
  FakeUploader.failureInfo = null
  FakeUploader.initialFailuresRemaining = 0
  FakeUploader.interruptedFailuresRemaining = 0
  FakeUploader.resumedTaskCancelled = false
  FakeUploader.startCount = 0
  FakeUploader.pausedKey = ''
  FakeUploader.cancelledKey = ''
  vi.restoreAllMocks()
  vi.useRealTimers()
})

test('direct uploader adapts API STS fields and returns the VOD VID', async () => {
  FakeUploader.startCount = 0
  const authorization: MediaUploadAuthorization = {
    mode: 'direct', appId: '1038811', region: 'ap-southeast-1', spaceName: 'short-drama', maxFileBytes: 1024,
    token: {
      AccessKeyID: 'temporary-ak', SecretAccessKey: 'temporary-sk', SessionToken: 'temporary-session',
      CurrentTime: '2026-07-14T00:00:00Z', ExpiredTime: '2026-07-14T01:00:00Z',
    },
    processActions: [{ Name: 'GetMeta' }, { Name: 'StartWorkflow', input: { TemplateId: 'workflow-1' } }],
    callbackArgs: '{"uploadId":"asset-1"}',
  }
  const progress = vi.fn()
  const uploader = createBytePlusUploader(FakeUploader)

  await expect(uploader.upload(new File(['video'], 'episode.mp4'), authorization, 'admin-1', progress)).resolves.toEqual({
    vid: 'vid-1', uploadRequestId: 'request-1',
  })
  expect(progress).toHaveBeenCalledWith(40)
  expect(FakeUploader.config).toMatchObject({
    appId: 1038811, userId: 'admin-1', region: 'ap-southeast-1',
    useLocalStorage: true, useFileNameInCacheKey: true,
    videoConfig: { spaceName: 'short-drama', processAction: [{ Name: 'GetMeta' }, { Name: 'StartWorkflow', Input: { TemplateId: 'workflow-1' } }] },
  })
  expect(FakeUploader.config).not.toHaveProperty('uploadHost')
  expect(FakeUploader.file?.processAction).toEqual([{ Name: 'GetMeta' }, { Name: 'StartWorkflow', Input: { TemplateId: 'workflow-1' } }])
  expect(FakeUploader.file?.fileName).toBeUndefined()
  expect(FakeUploader.file?.fileExtension).toBe('.mp4')
  expect(FakeUploader.file?.stsToken).toMatchObject({ AccessKeyId: 'temporary-ak', SessionToken: 'temporary-session' })
  expect(FakeUploader.file?.callbackArgs).toBe('{"uploadId":"asset-1"}')
})

test('SDK 终止分片任务后立即报错，并记录实际的 HTTP 状态', async () => {
  FakeUploader.shouldFail = true
  FakeUploader.failureInfo = { stage: 'uploadSlice', res: { status: 503 }, error: 'service unavailable', extra: { errorCode: 'NetworkError' } }
  const authorization: MediaUploadAuthorization = {
    mode: 'direct', appId: '1038811', region: 'ap-southeast-1', spaceName: 'short-drama', maxFileBytes: 1024,
    token: {
      AccessKeyID: 'temporary-ak', SecretAccessKey: 'temporary-sk', SessionToken: 'temporary-session',
      CurrentTime: '2026-07-14T00:00:00Z', ExpiredTime: '2026-07-14T01:00:00Z',
    },
  }
  const uploader = createBytePlusUploader(FakeUploader)

  const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  await expect(uploader.upload(new File(['video'], 'episode.mp4'), authorization, 'admin-1', vi.fn())).rejects.toMatchObject({
    message: '视频上传中断，请检查网络后重试',
    diagnostic: { stage: 'uploadSlice', code: 'NetworkError', status: 503, reason: 'service unavailable' },
  })
  expect(FakeUploader.cancelledKey).toBe('')
  expect(FakeUploader.startCount).toBe(1)
  expect(logger).toHaveBeenCalledWith('byteplus direct upload failed {"stage":"uploadSlice","code":"NetworkError","status":503,"reason":"service unavailable"}')
})

test('缓存续传任务被 SDK 取消后立即结束本集，不再对失效 key 定时重启', async () => {
  FakeUploader.interruptedFailuresRemaining = 1
  const authorization: MediaUploadAuthorization = {
    mode: 'direct', appId: '1038811', region: 'ap-southeast-1', spaceName: 'short-drama', maxFileBytes: 1024,
    token: { AccessKeyID: 'temporary-ak', SecretAccessKey: 'temporary-sk', SessionToken: 'temporary-session', CurrentTime: '2026-07-14T00:00:00Z', ExpiredTime: '2026-07-14T01:00:00Z' },
  }
  const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined)

  await expect(createBytePlusUploader(FakeUploader).upload(new File(['video'], 'episode.mp4'), authorization, 'admin-1', vi.fn())).rejects.toMatchObject({
    diagnostic: { stage: 'uploadSlice', code: 'NetworkError', status: 0, reason: 'connection reset' },
  })
  expect(FakeUploader.startCount).toBe(1)
  expect(FakeUploader.cancelledKey).toBe('')
  expect(logger).toHaveBeenCalledWith('byteplus direct upload failed {"stage":"uploadSlice","code":"NetworkError","status":0,"reason":"connection reset"}')
})


test('初始化上传节点首次无响应时自动新建任务重试一次', async () => {
  FakeUploader.initialFailuresRemaining = 1
  FakeUploader.initConfigs = []
  const authorization: MediaUploadAuthorization = {
    mode: 'direct', appId: '1038811', region: 'ap-southeast-1', spaceName: 'short-drama', maxFileBytes: 1024,
    token: { AccessKeyID: 'temporary-ak', SecretAccessKey: 'temporary-sk', SessionToken: 'temporary-session', CurrentTime: '2026-07-14T00:00:00Z', ExpiredTime: '2026-07-14T01:00:00Z' },
  }
  const logger = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

  await expect(createBytePlusUploader(FakeUploader).upload(new File(['video'], 'episode.mp4'), authorization, 'admin-1', vi.fn())).resolves.toEqual({ vid: 'vid-1', uploadRequestId: 'request-1' })
  expect(FakeUploader.initConfigs).toHaveLength(2)
  expect(FakeUploader.initConfigs.every((config) => !('uploadHost' in config))).toBe(true)
  expect(logger).toHaveBeenCalledWith('retrying byteplus initial upload session')
  logger.mockRestore()
  FakeUploader.initialFailuresRemaining = 0
})

test('SDK 未提供 HTTP 状态时不把默认诊断 0 当成网络失败重试', async () => {
  FakeUploader.shouldFail = true
  FakeUploader.failureInfo = { stage: 'initUploadID', extra: { errorCode: 'InvalidParam', message: 'invalid upload option' } }
  const authorization: MediaUploadAuthorization = {
    mode: 'direct', appId: '1038811', region: 'ap-southeast-1', spaceName: 'short-drama', maxFileBytes: 1024,
    token: { AccessKeyID: 'temporary-ak', SecretAccessKey: 'temporary-sk', SessionToken: 'temporary-session', CurrentTime: '2026-07-14T00:00:00Z', ExpiredTime: '2026-07-14T01:00:00Z' },
  }
  const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined)

  await expect(createBytePlusUploader(FakeUploader).upload(new File(['video'], 'episode.mp4'), authorization, 'admin-1', vi.fn())).rejects.toMatchObject({
    diagnostic: { stage: 'initUploadID', code: 'InvalidParam', status: 0 }, hasHTTPStatus: false,
  })
  expect(FakeUploader.startCount).toBe(1)
  expect(logger).toHaveBeenCalledOnce()
})

test('SDK 从 res 返回 403 时提示重新授权且不重试', async () => {
  FakeUploader.shouldFail = true
  FakeUploader.failureInfo = { stage: 'uploadSlice', res: { status: 403 }, extra: { errorCode: 'Forbidden', message: 'access denied' } }
  const authorization: MediaUploadAuthorization = {
    mode: 'direct', appId: '1038811', region: 'ap-southeast-1', spaceName: 'short-drama', maxFileBytes: 1024,
    token: { AccessKeyID: 'temporary-ak', SecretAccessKey: 'temporary-sk', SessionToken: 'temporary-session', CurrentTime: '2026-07-14T00:00:00Z', ExpiredTime: '2026-07-14T01:00:00Z' },
  }
  const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined)

  await expect(createBytePlusUploader(FakeUploader).upload(new File(['video'], 'episode.mp4'), authorization, 'admin-1', vi.fn())).rejects.toMatchObject({
    message: '上传授权已失效，请重新选择视频后上传',
    diagnostic: { stage: 'uploadSlice', code: 'Forbidden', status: 403, reason: 'access denied' }, hasHTTPStatus: true,
  })
  expect(FakeUploader.startCount).toBe(1)
  expect(logger).toHaveBeenCalledWith('byteplus direct upload failed {"stage":"uploadSlice","code":"Forbidden","status":403,"reason":"access denied"}')
})

test('SDK 启动异常记录脱敏原因，取消已创建任务并返回统一提示', async () => {
  FakeUploader.startError = new Error('startup failed SessionToken=temporary-secret')
  const authorization: MediaUploadAuthorization = {
    mode: 'direct', appId: '1038811', region: 'ap-southeast-1', spaceName: 'short-drama', maxFileBytes: 1024,
    token: { AccessKeyID: 'temporary-ak', SecretAccessKey: 'temporary-sk', SessionToken: 'temporary-session', CurrentTime: '2026-07-14T00:00:00Z', ExpiredTime: '2026-07-14T01:00:00Z' },
  }
  const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined)

  await expect(createBytePlusUploader(FakeUploader).upload(new File(['video'], 'episode.mp4'), authorization, 'admin-1', vi.fn())).rejects.toMatchObject({
    message: 'BytePlus VOD 上传启动失败，请稍后重试',
  })
  expect(FakeUploader.cancelledKey).toBe('upload-key-1')
  expect(logger).toHaveBeenCalledWith('start byteplus upload failed', { error: 'startup failed SessionToken:redacted' })
  expect(JSON.stringify(logger.mock.calls)).not.toContain('temporary-secret')
})

test('SDK 完成事件缺少 VID 时记录请求 ID 并拒绝提交', async () => {
  FakeUploader.missingVID = true
  const authorization: MediaUploadAuthorization = {
    mode: 'direct', appId: '1038811', region: 'ap-southeast-1', spaceName: 'short-drama', maxFileBytes: 1024,
    token: { AccessKeyID: 'temporary-ak', SecretAccessKey: 'temporary-sk', SessionToken: 'temporary-session', CurrentTime: '2026-07-14T00:00:00Z', ExpiredTime: '2026-07-14T01:00:00Z' },
  }
  const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined)

  await expect(createBytePlusUploader(FakeUploader).upload(new File(['video'], 'episode.mp4'), authorization, 'admin-1', vi.fn())).rejects.toMatchObject({
    message: 'BytePlus VOD 上传完成但未返回 VID，请重试上传',
  })
  expect(logger).toHaveBeenCalledWith('byteplus upload completed without VID', { uploadRequestId: 'request-1' })
})

test('只记录 ApplyUploadInfo 域名和请求 ID，不输出临时凭据或原始响应', async () => {
  const secret = 'sensitive-upload-credential'
  FakeUploader.preUploadInfo = {
    type: 'success',
    tosDomain: 'https://upload.example.com',
    res: { body: JSON.stringify({
      ResponseMetadata: { RequestId: 'request-123' },
      Result: { Data: { UploadAddress: {
        UploadHosts: ['upload.example.com', 'backup.example.com', `https://bad.example.com/?token=${secret}`],
        StoreInfos: [{ Auth: secret }], SessionKey: secret,
      } } },
    }) },
  }
  const logger = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  const authorization: MediaUploadAuthorization = {
    mode: 'direct', appId: '1038811', region: 'ap-southeast-1', spaceName: 'short-drama', maxFileBytes: 1024,
    token: { AccessKeyID: 'temporary-ak', SecretAccessKey: 'temporary-sk', SessionToken: 'temporary-session', CurrentTime: '2026-07-14T00:00:00Z', ExpiredTime: '2026-07-14T01:00:00Z' },
  }

  await expect(createBytePlusUploader(FakeUploader).upload(new File(['video'], 'episode.mp4'), authorization, 'admin-1', vi.fn())).resolves.toEqual({ vid: 'vid-1', uploadRequestId: 'request-1' })
  expect(logger).toHaveBeenCalledWith('byteplus upload address selected', JSON.stringify({
    source: 'apply', returnedHosts: ['upload.example.com', 'backup.example.com'],
    selectedHost: 'upload.example.com', requestId: 'request-123',
  }))
  expect(JSON.stringify(logger.mock.calls)).not.toContain(secret)
  logger.mockRestore()
  FakeUploader.preUploadInfo = null
})

test('上传地址响应格式错误时只记录解析类型，不输出原始凭据片段', async () => {
  const secret = 'sensitive-upload-credential'
  FakeUploader.preUploadInfo = { type: 'success', res: { body: `{"SessionToken":"${secret}"` } }
  const logger = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  const authorization: MediaUploadAuthorization = {
    mode: 'direct', appId: '1038811', region: 'ap-southeast-1', spaceName: 'short-drama', maxFileBytes: 1024,
    token: { AccessKeyID: 'temporary-ak', SecretAccessKey: 'temporary-sk', SessionToken: 'temporary-session', CurrentTime: '2026-07-14T00:00:00Z', ExpiredTime: '2026-07-14T01:00:00Z' },
  }

  await expect(createBytePlusUploader(FakeUploader).upload(new File(['video'], 'episode.mp4'), authorization, 'admin-1', vi.fn())).resolves.toEqual({
    vid: 'vid-1', uploadRequestId: 'request-1',
  })
  expect(logger).toHaveBeenCalledWith('parse byteplus upload address response failed', {
    error: 'invalid JSON', responseLength: `{"SessionToken":"${secret}"`.length,
  })
  expect(JSON.stringify([logger.mock.calls, info.mock.calls])).not.toContain(secret)
})
