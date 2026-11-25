import type { Action, FileOption, Options } from '@byteplus/uploader'
import type { MediaUploadAuthorization } from '../domain'
import { UserFacingError } from '../userMessage'

export interface DirectUploadResult {
  // vid 是 BytePlus 返回的视频标识，业务系统按字符串保存。
  vid: string
  // uploadRequestId 用于追踪本次 VOD 上传请求。
  uploadRequestId: string
}

// DirectUploadDiagnostic 是可安全回传服务端日志的 SDK 失败摘要。
export interface DirectUploadDiagnostic {
  // stage 是 SDK 报错所在阶段。
  stage: string
  // code 是 SDK 返回的稳定错误码。
  code: string
  // status 是 HTTP 状态；无响应时为 0。
  status: number
  // reason 是已过滤 URL 的简短故障原因。
  reason: string
}

// DirectUploadError 保留可展示的错误文案和脱敏诊断摘要。
export class DirectUploadError extends UserFacingError {
  // diagnostic 可回传给服务端记录，不包含上传凭据和原始响应。
  readonly diagnostic: DirectUploadDiagnostic
  // hasHTTPStatus 区分真实的网络状态 0 和 SDK 未提供响应状态。
  readonly hasHTTPStatus: boolean

  // 构造用户可见的上传错误，同时保存是否取得 HTTP 状态供初始化重试判断。
  constructor(message: string, diagnostic: DirectUploadDiagnostic, hasHTTPStatus = false) {
    super(message)
    this.name = 'DirectUploadError'
    this.diagnostic = diagnostic
    this.hasHTTPStatus = hasHTTPStatus
  }
}

export interface DirectMediaUploader {
  // upload 使用本次服务端授权直传文件，返回 VID 和请求 ID，进度只报告本次任务。
  upload(file: File, authorization: MediaUploadAuthorization, userId: string, onProgress: (progress: number) => void): Promise<DirectUploadResult>
}

interface UploaderLike {
  addFile(options: FileOption): string
  start(key?: string): void
  pause(key?: string): void
  cancel(key?: string): void
  on(eventName: 'complete' | 'error' | 'progress' | 'preUpload', callback: (info: Record<string, unknown>) => void): void
  removeAllListeners(eventName: 'complete' | 'error' | 'progress' | 'preUpload'): void
}

// BytePlus 1.1.3 的公开类型遗漏了文档中的 region 和部分运行时选项。
type BytePlusInitConfig = Options & {
  region: string
  useLocalStorage?: boolean
  useFileNameInCacheKey?: boolean
  useServerCurrentTime?: boolean
  taskParallelLimit?: number
}

// UploaderConstructor 允许测试注入 SDK 实例，运行时使用官方上传器。
export type UploaderConstructor = new (options: BytePlusInitConfig) => UploaderLike

// BytePlusVODProcessAction 是 VOD CommitUploadInfo 接口接受的 Functions JSON 结构。
// SDK 类型声明使用小写字段，但运行时会原样透传，必须使用 VOD 协议规定的大写字段。
type BytePlusVODProcessAction = {
  Name: Action['name']
  Input?: Record<string, string>
}

// createBytePlusUploader 创建管理端唯一允许使用的 BytePlus 官方浏览器上传适配器。
export function createBytePlusUploader(Uploader?: UploaderConstructor): DirectMediaUploader {
  return {
    async upload(file, authorization, userId, onProgress) {
      // 官方包 1.1.3 的声明文件未包含文档中的 region，并把事件参数写成 object；
      // 适配层只在这个边界做一次收窄，业务组件不直接依赖 SDK 类型缺口。
      const UploaderClass = Uploader ?? (await import('@byteplus/uploader')).default as unknown as UploaderConstructor
      // 初始化请求无节点响应时重建任务，让 SDK 重新申请官方上传地址。
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return await uploadWithBytePlus(UploaderClass, file, authorization, userId, onProgress)
        } catch (error) {
          if (!(error instanceof DirectUploadError) || !shouldRetryInitialUpload(error) || attempt === 1) throw error
          console.warn('retrying byteplus initial upload session')
        }
      }
      throw new UserFacingError('BytePlus VOD 上传启动失败，请稍后重试')
    },
  }
}

// shouldRetryInitialUpload 仅对尚未传输文件、且没有收到节点响应的初始化失败执行一次全新任务重试。
function shouldRetryInitialUpload(error: DirectUploadError): boolean {
  return error.diagnostic.stage === 'initUploadID' && error.hasHTTPStatus && error.diagnostic.status === 0
}

// uploadWithBytePlus 校验服务端下发的短期凭据，并把文件直接交给官方 SDK。
async function uploadWithBytePlus(
  Uploader: UploaderConstructor,
  file: File,
  authorization: MediaUploadAuthorization,
  userId: string,
  onProgress: (progress: number) => void,
): Promise<DirectUploadResult> {
  const appId = Number(authorization.appId)
  const token = authorization.token
  const spaceName = authorization.spaceName?.trim() ?? ''
  const region = authorization.region?.trim() ?? ''
  if (authorization.mode !== 'direct' || !Number.isSafeInteger(appId) || appId <= 0 || !token || !spaceName || !region || !userId.trim()) {
    throw new UserFacingError('BytePlus VOD 上传配置不完整，请联系管理员检查媒资配置')
  }
  if (file.size <= 0 || file.size > authorization.maxFileBytes) {
    throw new UserFacingError(`视频大小必须在 1 B 至 ${formatBytes(authorization.maxFileBytes)} 之间`)
  }
  const extension = file.name.match(/\.[^./\\]+$/)?.[0]?.toLowerCase()
  if (!extension) throw new UserFacingError('视频文件名需要有效扩展名')

  const processAction: BytePlusVODProcessAction[] = (authorization.processActions ?? []).map((action) => ({
    Name: action.Name,
    Input: action.input,
  }))
  const uploader = new Uploader({
    userId: userId.trim(),
    appId,
    region,
    // 上传器的声明类型与 VOD 实际 Functions 协议不一致，运行时需保留大写字段。
    videoConfig: { spaceName, processAction: processAction as unknown as Action[] },
    // 官方 SDK 只缓存分片断点；File 仍由运营重新选择，短期授权由服务端续发。
    useLocalStorage: true,
    useFileNameInCacheKey: true,
    useServerCurrentTime: true,
    taskParallelLimit: 1,
    noLog: true,
  })

  return new Promise((resolve, reject) => {
    let key = ''
    let settled = false
    const cleanup = (action: 'none' | 'cancel') => {
      uploader.removeAllListeners('progress')
      uploader.removeAllListeners('complete')
      uploader.removeAllListeners('error')
      uploader.removeAllListeners('preUpload')
      try {
        if (action === 'cancel' && key) uploader.cancel(key)
      } catch (error) {
        console.warn('clean up byteplus upload task failed', { error: diagnosticReason(error instanceof Error ? error.message : error) || 'unknown' })
      }
    }
    const finish = (callback: () => void, action: 'none' | 'cancel' = 'none') => {
      if (settled) return
      settled = true
      cleanup(action)
      callback()
    }
    uploader.on('preUpload', (info) => {
      if (!matchesUpload(info, key) || info.type !== 'success') return
      // 只记录域名与请求 ID；SDK 响应还包含临时上传凭据，不得输出原始事件或响应。
      console.info('byteplus upload address selected', JSON.stringify(uploadAddressDiagnostic(info)))
    })
    uploader.on('progress', (info) => {
      if (!matchesUpload(info, key)) return
      const percent = Number(info.percent)
      if (Number.isFinite(percent)) onProgress(Math.max(0, Math.min(100, Math.round(percent))))
    })
    uploader.on('error', (info) => {
      if (!matchesUpload(info, key)) return
      const diagnostic = directUploadDiagnostic(info)
      console.error(`byteplus direct upload failed ${JSON.stringify(diagnostic)}`)
      // SDK 已完成内部重试；错误事件返回后由 SDK 暂停新任务或取消失效的缓存续传任务。
      // 此处必须立即结算，否则缓存任务被取消后继续 start(key) 会让整个剧集批次一直等待。
      finish(() => reject(new DirectUploadError(uploadErrorMessage(info), diagnostic, uploadHTTPStatus(info) !== undefined)))
    })
    uploader.on('complete', (info) => {
      if (!matchesUpload(info, key)) return
      const result = directUploadResult(info)
      finish(() => {
        if (!result.vid) {
          console.error('byteplus upload completed without VID', { uploadRequestId: result.uploadRequestId })
          reject(new UserFacingError('BytePlus VOD 上传完成但未返回 VID，请重试上传'))
        } else resolve(result)
      })
    })

    try {
      key = uploader.addFile({
        file,
        // BytePlus 将 fileName 当作云端路径；只传扩展名可由 VOD 为同名剧集生成独立路径。
        fileExtension: extension,
        type: 'video',
        callbackArgs: authorization.callbackArgs,
        processAction: processAction as unknown as Action[],
        stsToken: {
          AccessKeyId: token.AccessKeyID,
          SecretAccessKey: token.SecretAccessKey,
          SessionToken: token.SessionToken,
          ExpiredTime: token.ExpiredTime,
          CurrentTime: token.CurrentTime,
        },
      })
      if (!key) throw new UserFacingError('BytePlus VOD 未能创建上传任务，请稍后重试')
      uploader.start(key)
    } catch (error) {
      if (!(error instanceof UserFacingError)) {
        console.error('start byteplus upload failed', { error: diagnosticReason(error instanceof Error ? error.message : error) || 'unknown' })
      }
      finish(() => reject(error instanceof UserFacingError ? error : new UserFacingError('BytePlus VOD 上传启动失败，请稍后重试')), 'cancel')
    }
  })
}

function matchesUpload(info: Record<string, unknown>, key: string): boolean {
  return !key || typeof info.key !== 'string' || info.key === key
}

function directUploadResult(info: Record<string, unknown>): DirectUploadResult {
  const roots = [info, record(info.uploadResult), record(info.result), record(info.data), record(info.extra)].filter(Boolean) as Record<string, unknown>[]
  let vid = ''
  let uploadRequestId = ''
  for (const root of roots) {
    const data = record(root.Data) ?? record(root.data)
    vid ||= stringValue(root.Vid) || stringValue(root.vid) || stringValue(data?.Vid) || stringValue(data?.vid)
    uploadRequestId ||= stringValue(root.RequestId) || stringValue(root.requestId) || stringValue(data?.RequestId) || stringValue(data?.requestId)
  }
  return { vid, uploadRequestId }
}

function uploadErrorMessage(info: Record<string, unknown>): string {
  const extra = record(info.extra)
  const errorCode = stringValue(extra?.errorCode).toLowerCase()
  const status = uploadHTTPStatus(info)
  if (errorCode.includes('token') || errorCode.includes('auth') || status === 401 || status === 403) {
    return '上传授权已失效，请重新选择视频后上传'
  }
  const stage = stringValue(info.stage).toLowerCase()
  if (stage === 'inituploadid' && status === 0) {
    return 'BytePlus 上传节点连接失败，请检查网络后重试'
  }
  if (errorCode.includes('network') || stage.includes('upload')) {
    return '视频上传中断，请检查网络后重试'
  }
  return 'BytePlus VOD 上传失败，请稍后重试'
}

// uploadHTTPStatus 优先读取 SDK 1.1.3 事件的 res.status，兼容旧事件中的 xhr.status。
function uploadHTTPStatus(info: Record<string, unknown>): number | undefined {
  const raw = record(info.res)?.status ?? record(info.xhr)?.status
  if (raw === undefined || raw === null || raw === '') return undefined
  const status = Number(raw)
  return Number.isInteger(status) && status >= 0 && status <= 599 ? status : undefined
}

function directUploadDiagnostic(info: Record<string, unknown>): DirectUploadDiagnostic {
  const extra = record(info.extra)
  return {
    stage: diagnosticValue(info.stage) || 'unknown',
    code: diagnosticValue(extra?.errorCode) || 'unknown',
    status: uploadHTTPStatus(info) ?? 0,
    reason: diagnosticReason(extra?.message ?? info.error ?? info.message) || 'unknown',
  }
}

// uploadAddressDiagnostic 对照 ApplyUploadInfo 下发域名与 SDK 实际选用域名，排查缓存或节点映射错误。
function uploadAddressDiagnostic(info: Record<string, unknown>): {
  source: 'apply' | 'cache' | 'unknown'
  returnedHosts: string[]
  selectedHost: string
  requestId: string
} {
  const xhr = record(info.xhr)
  const raw = record(info.res)?.body ?? xhr?.response ?? xhr?.responseText
  let response: Record<string, unknown> | undefined
  if (typeof raw === 'string' && raw.length <= 1_048_576) {
    try {
      response = record(JSON.parse(raw))
    } catch (error) {
      // SyntaxError 可能引用含临时凭据的响应片段，只记录安全的错误类型与长度。
      console.warn('parse byteplus upload address response failed', {
        error: error instanceof SyntaxError ? 'invalid JSON' : diagnosticReason(error instanceof Error ? error.message : error) || 'unknown',
        responseLength: raw.length,
      })
    }
  } else {
    response = record(raw)
  }
  const result = record(response?.Result)
  const data = record(result?.Data)
  const mainAddresses = record(data?.CandidateUploadAddresses)?.MainUploadAddresses
  const address = (Array.isArray(mainAddresses) ? record(mainAddresses[0]) : undefined)
    ?? record(data?.UploadAddress) ?? record(result?.UploadAddress)
  const returnedHosts = Array.isArray(address?.UploadHosts)
    ? address.UploadHosts.map(safeUploadHost).filter(Boolean)
    : []
  const selectedHost = safeSelectedUploadHost(info.tosDomain)
  const requestId = diagnosticValue(record(response?.ResponseMetadata)?.RequestId)
  return {
    source: address ? 'apply' : info.isBreak ? 'cache' : 'unknown',
    returnedHosts,
    selectedHost,
    requestId,
  }
}

function safeUploadHost(value: unknown): string {
  if (typeof value !== 'string') return ''
  const host = value.trim().toLowerCase()
  return host.length <= 253 && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host) ? host : ''
}

function safeSelectedUploadHost(value: unknown): string {
  if (typeof value !== 'string') return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || (url.pathname !== '' && url.pathname !== '/') || url.search || url.hash) return ''
    return safeUploadHost(url.hostname)
  } catch {
    return ''
  }
}

function diagnosticValue(value: unknown): string {
  return String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
}

// diagnosticReason 仅保留 SDK 的短文本原因，剔除 URL，避免把上传地址或响应正文回传到日志。
function diagnosticReason(value: unknown): string {
  return String(value ?? '')
    .replace(/https?:\/\/[^\s]+/gi, '')
    .replace(/\b(AccessKeyId|SecretAccessKey|SessionToken|token|signature|auth_key)\b\s*[:=]\s*[^\s,;]+/gi, '$1:[redacted]')
    .replace(/[^A-Za-z0-9 _:-]/g, '')
    .trim()
    .slice(0, 128)
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function formatBytes(value: number): string {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(value % 1024 ** 3 === 0 ? 0 : 1)} GB`
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${value} B`
}
