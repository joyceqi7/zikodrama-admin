import { ApiError } from './api'

// UserFacingError 标记已经由前端业务层编写、允许直接展示给运营人员的提示。
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserFacingError'
  }
}

// API_ERROR_MESSAGES 按稳定错误码提供中文操作指引，不透传服务端或代理的原始文案。
const API_ERROR_MESSAGES: Record<string, string> = {
  internal_error: '暂时无法完成操作，请稍后重试',
  network_error: '网络连接失败，请检查网络后重试',
  request_timeout: '等待时间较长，请刷新确认结果后再试',
  request_cancelled: '操作已中断，请刷新确认结果后再试',
  invalid_response: '暂时无法确认操作结果，请刷新查看后再试',
  invalid_credentials: '账号或密码不正确，请检查后重试',
  unauthorized: '登录已失效，请重新登录',
  operations_unauthorized: '登录已失效，请重新登录',
  permission_denied: '你暂无此操作权限，请联系管理员开通',
  too_many_requests: '操作太频繁了，请稍等片刻再试',
  audit_unavailable: '暂时无法完成操作，请稍后重试',
  service_unavailable: '服务暂时不可用，请稍后重试',
  application_required: '请先选择应用',
  invalid_application: '所选应用已不可用，请刷新后重新选择',
  invalid_request: '填写的信息有误，请检查必填项和格式后重试',
  invalid_input: '填写的信息有误，请检查必填项和格式后重试',
  invalid_cover: '请选择 JPEG、PNG 或 WebP 格式的封面图片',
  not_found: '内容已不存在或不可用，请刷新列表后重试',
  state_conflict: '当前状态不支持此操作，或内容已重复，请刷新检查后重试',
  album_update_unconfirmed: '官方版本尚未确认，冻结内容和进度已保留，请稍后再恢复同步',
  publication_in_recommendations: '请先从当前渠道的轮播或热播中移除该短剧，再下线',
  application_monetization_mode_conflict: '解锁方式与当前小程序变现模式不符，请先调整不兼容的规则再保存或切换模式',
  application_ad_units_incomplete: '请先在「应用管理」的广告位配置中填写激励视频候选 code 和一个插屏 code，再启用应用或策略',
  last_super_admin: '请至少保留一位启用的超级管理员',
  media_not_ready: '部分分集视频尚未就绪，请等待处理完成后再发布',
  content_not_ready: '请补齐短剧名称、简介、封面和全部分集视频后再发布',
  publication_not_ready: '请补齐短剧简介、封面、至少一个 TikTok 标签和分集视频，并检查主体发布配置后再同步',
  media_upload_discarded: '该分集已有上传任务，请刷新查看进度后再试',
  provider_not_configured: '此功能尚未配置完成，请联系管理员检查配置',
  campaign_link_unavailable: '推广链接暂时生成失败，请检查应用的平台配置后重试',
}

// toUserMessage 是管理后台唯一的异常转展示文案出口。
// API 错误仅按错误码或 HTTP 状态映射；只有本地显式标记的友好提示允许直接展示。
export function toUserMessage(error: unknown, fallback = '操作失败，请稍后重试'): string {
  if (error instanceof ApiError) {
    if (Object.hasOwn(API_ERROR_MESSAGES, error.code)) return API_ERROR_MESSAGES[error.code]
    if (error.status === 401) return API_ERROR_MESSAGES.unauthorized
    if (error.status === 403) return API_ERROR_MESSAGES.permission_denied
    if (error.status === 409) return API_ERROR_MESSAGES.state_conflict
    if (error.status === 404) return API_ERROR_MESSAGES.not_found
    if (error.status === 400) return API_ERROR_MESSAGES.invalid_request
    if (error.status === 429) return API_ERROR_MESSAGES.too_many_requests
    if (error.status >= 500) return API_ERROR_MESSAGES.internal_error
    return fallback
  }
  if (error instanceof UserFacingError && error.message.trim()) return error.message.trim()
  return fallback
}
