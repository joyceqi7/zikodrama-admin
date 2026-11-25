// TikTokPostbackEvent 是当前客户端实际回传的官方关键行为名。
export type TikTokPostbackEvent = 'video_play_request' | 'ep_play' | 'minis_ad_show'

// TikTokPostbackOutcome 区分发起、SDK 明确成功和明确失败。
export type TikTokPostbackOutcome = 'attempt' | 'success' | 'failure' | 'unknown' | 'skipped'

// TikTokPostbackLog 是服务端保存的脱敏回传事实，不含 OpenID、Token 或 SDK 参数。
export interface TikTokPostbackLog {
  // userId 是内部用户主键字符串，不能转换为 JavaScript 数字。
  userId: string
  // eventId 关联同一次回传的尝试与最终结果。
  eventId: string
  // event 是官方关键行为名。
  event: TikTokPostbackEvent
  // outcome 是当前日志事实的结果。
  outcome: TikTokPostbackOutcome
  // occurredAt 是客户端观察时间。
  occurredAt: string
  // receivedAt 是服务端首次接收时间。
  receivedAt: string
  // details 是七天保留的脱敏参数；旧客户端或过期记录不提供。
  details?: TikTokPostbackDetails
}

// TikTokPostbackLogQuery 是应用内日志筛选与游标分页条件。
export interface TikTokPostbackLogQuery {
  // cursor 是上一页返回的定位值；首页不传。
  cursor?: string
  // pageSize 是每页条数，最大 100。
  pageSize: number
  // event 为空时查询全部事件。
  event?: TikTokPostbackEvent
  // outcome 为空时查询全部结果。
  outcome?: TikTokPostbackOutcome
  // scene 筛选固定业务入口。
  scene?: string
  // clientVersion 筛选客户端构建修订。
  clientVersion?: string
  // errorCode 筛选官方数值错误码。
  errorCode?: string
  // from 是可选 UTC 起始日。
  from?: string
  // to 是 UTC 结束日，包含当天。
  to?: string
}

// TikTokPostbackLogPage 是同一应用与筛选条件下的游标页。
export interface TikTokPostbackLogPage {
  // items 按服务端接收时间倒序排列。
  items: TikTokPostbackLog[]
  // hasMore 表示还有后续记录。
  hasMore: boolean
  // nextCursor 定位下一页，末页为空。
  nextCursor: string
  // pageSize 回显服务端每页数量。
  pageSize: number
}

// TikTokPostbackDetails 是实际提交 SDK 的参数快照，不包含真实 OpenID 或原始回调对象。
export interface TikTokPostbackDetails {
  // scene 是播放、入剧、解锁、VIP 或插屏入口。
  scene: string
  // clientVersion 是 Mini 包的构建修订。
  clientVersion: string
  // params 区分省略、空字符串和 null。
  params: Record<string, string | number | null>
  // warnings 是上下文缺失的固定分类。
  warnings: string[]
  // elapsedMs 是 SDK 调用至结果的耗时。
  elapsedMs?: number
  // reason 是结果的固定分类。
  reason?: string
  // errorCode 是官方错误码。
  errorCode?: string
  // subErrorCode 是官方子码。
  subErrorCode?: string
  // errorMessage 是经过服务端二次脱敏的有界错误消息。
  errorMessage?: string
}
