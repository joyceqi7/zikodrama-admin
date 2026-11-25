import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { toUserMessage, UserFacingError } from './userMessage'

describe('toUserMessage', () => {
  it('将服务端错误转为中文指引并保留本地友好提示', () => {
    expect(toUserMessage(new ApiError('请检查短剧资料后重试', 400, 'invalid_input'))).toBe('填写的信息有误，请检查必填项和格式后重试')
    expect(toUserMessage(new UserFacingError('视频上传中断，请检查网络后重试'))).toBe('视频上传中断，请检查网络后重试')
  })

  it('隐藏浏览器和 SDK 原始异常', () => {
    expect(toUserMessage(new TypeError('Failed to fetch internal endpoint'))).toBe('操作失败，请稍后重试')
    expect(toUserMessage({ secret: 'do-not-display' }, '页面加载失败，请重试')).toBe('页面加载失败，请重试')
  })
})

it('广告位未配齐的服务端错误展示中文补齐指引', () => {
  expect(toUserMessage(new ApiError('Configure ad units', 409, 'application_ad_units_incomplete'))).toBe('请先在「应用管理」的广告位配置中填写激励视频候选 code 和一个插屏 code，再启用应用或策略')
})

it('短剧仍在推荐配置时提示先移除，不透传内部配置细节', () => {
  expect(toUserMessage(new ApiError('private config or database error', 409, 'publication_in_recommendations'))).toBe('请先从当前渠道的轮播或热播中移除该短剧，再下线')
})

it('官方版本尚未确认时提示保留检查点，不展示平台原始故障', () => {
  expect(toUserMessage(new ApiError('TikTok http_500; token=private', 409, 'album_update_unconfirmed'))).toBe('官方版本尚未确认，冻结内容和进度已保留，请稍后再恢复同步')
})

it('官方同步前置校验失败时提示补选 TikTok 标签，不透传平台原始错误', () => {
  expect(toUserMessage(new ApiError('tag_list is required; token=private', 409, 'publication_not_ready'))).toBe('请补齐短剧简介、封面、至少一个 TikTok 标签和分集视频，并检查主体发布配置后再同步')
})

// 即使已知错误码带有内部细节，也只能展示客户端约定的提示。
it('隐藏 API 内部错误与未知响应，区分权限和系统故障', () => {
  expect(toUserMessage(new ApiError("Unknown column monetization_mode; request ID", 500, 'internal_error'))).toBe('暂时无法完成操作，请稍后重试')
  expect(toUserMessage(new ApiError('SQL failed', 502, 'unknown'))).toBe('暂时无法完成操作，请稍后重试')
  expect(toUserMessage(new ApiError('private response', 400, 'unknown'))).toBe('填写的信息有误，请检查必填项和格式后重试')
  expect(toUserMessage(new ApiError('Forbidden', 403, 'permission_denied'))).toContain('暂无此操作权限')
  expect(toUserMessage(new ApiError('expired', 401, 'unauthorized'))).toBe('登录已失效，请重新登录')
})
