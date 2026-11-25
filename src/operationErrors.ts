import { ApiError } from './api'
import { toUserMessage, UserFacingError } from './userMessage'

// reportOperationFailure 在管理端业务边界记录操作及错误详情，并返回统一的用户提示。
// 仅提取异常消息，移除媒体地址和凭据字段，不记录 SDK、表单或响应对象。
export function reportOperationFailure(operation: string, cause: unknown): string {
  const error = safeErrorDetail(cause)
  const expected = cause instanceof UserFacingError || (cause instanceof ApiError && cause.status >= 400 && cause.status < 500)
  if (expected) console.warn(operation, { error })
  else console.error(operation, { error })
  return toUserMessage(cause)
}

// safeErrorDetail 为诊断日志保留实际错误，并移除媒体地址和凭据。
export function safeErrorDetail(cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '未知错误'
  return detail
    .replace(/(?:https?:\/\/|blob:|data:)[^\s<>"']+/gi, '[URL 已脱敏]')
    .replace(/((?:authorization|cookie|password|secret(?:[_-]?access[_-]?key)?|access[_-]?key(?:[_-]?id)?|(?:session|access|refresh)?[_-]?token|signature)["']?\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[已脱敏]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [已脱敏]')
}
