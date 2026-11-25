import { expect, test, vi } from 'vitest'
import { reportDramaFailure } from './dramaEditorErrors'

test('日志保留故障原因，但不包含 JSON 凭据、媒体 URL 或 Bearer 令牌', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    const message = reportDramaFailure('upload failed', new Error('timeout {"SessionToken":"hidden", "SecretAccessKey":"secret-value"} Bearer bearer-value https://media.test/a?signature=private'))
    expect(message).toBe('操作失败，请稍后重试')
    expect(log).toHaveBeenCalledWith('upload failed', { error: 'timeout {"SessionToken":[已脱敏], "SecretAccessKey":[已脱敏]} Bearer [已脱敏] [URL 已脱敏]' })
  } finally { log.mockRestore() }
})

test('诊断保留数据库错误，界面只收到中文提示，蛇形凭据也脱敏', async () => {
  const { ApiError } = await import('../../api')
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    const message = reportDramaFailure('save application failed', new ApiError('Unknown column monetization_mode secret_access_key=private-key access_token=private-token', 500, 'internal_error'))
    expect(message).toBe('暂时无法完成操作，请稍后重试')
    expect(log).toHaveBeenCalledWith('save application failed', { error: 'Unknown column monetization_mode secret_access_key=[已脱敏] access_token=[已脱敏]' })
  } finally { log.mockRestore() }
})
