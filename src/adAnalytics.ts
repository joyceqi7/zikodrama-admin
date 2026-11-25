// AdQuery 限定当前应用及最近九十日 UTC 范围，不携带平台凭据。
export interface AdQuery {
  // from 是开始日期。
  from: string
  // to 是包含当天的结束日期。
  to: string
  // pageSize 限定每页数量。
  pageSize: number
  // cursor 是绑定筛选条件的定位值。
  cursor?: string
  // adType 区分激励与插屏。
  adType?: string
  // adUnitId 精确筛选广告位。
  adUnitId?: string
  // scene 精确筛选入口。
  scene?: string
  // clientVersion 精确筛选 Mini 构建。
  clientVersion?: string
  // os 精确筛选系统类型。
  os?: string
  // tiktokVersion 精确筛选客户端版本。
  tiktokVersion?: string
  // errorCode 匹配一次调用任一阶段的错误码。
  errorCode?: string
}
// AdSummary 是客户端观测口径，不能冒充平台请求或计费曝光。
export interface AdSummary {
  // calls 是去重广告调用。
  calls: number
  // requests 是实际调用 show 的次数。
  requests: number
  // shown 是客户端确认展示次数。
  shown: number
  // matchedShown 是已关联同一调用请求的展示数，专用于漏斗分母匹配。
  matchedShown: number
  // completed 是激励完播次数。
  completed: number
  // failedBeforeShow 是已请求但未确认展示的错误。
  failedBeforeShow: number
  // failedAfterShow 是展示后发生的错误，不抵消展示。
  failedAfterShow: number
  // createFailures 是进入 show 前的创建或准备错误。
  createFailures: number
  // cancelled 是激励未完播或用户取消。
  cancelled: number
  // unknown 是未确认展示的超时。
  unknown: number
  // closeUnknown 是尚未确认关闭的超时。
  closeUnknown: number
  // pending 是仍无明确结果的展示请求。
  pending: number
  // skipped 是本地拦截。
  skipped: number
  // timingSamples 只含 show Promise 成功且关联请求的样本，不含完播补证。
  timingSamples: number
  // p50Ms 是 show Promise 确认展示的中位耗时。
  p50Ms: number | null
  // p95Ms 是已展示样本的九十五分位耗时。
  p95Ms: number | null
}
// AdEvent 是可公开的阶段诊断，不包含原始 SDK 对象。
export interface AdEvent {
  // kind 是阶段事实名。
  kind: string
  // stage 是错误或超时的来源阶段。
  stage: string
  // reason 是固定结果分类。
  reason?: string
  // errorCode 是官方数值错误码。
  errorCode?: string
  // subErrorCode 是官方子码。
  subErrorCode?: string
  /** innerErrorCode 是独立内部码，不覆盖子码。 */
  innerErrorCode?: string
  // elapsedMs 是调用以来的耗时。
  elapsedMs?: number
  // showElapsedMs 是 show 以来的耗时。
  showElapsedMs?: number
  // evidence 区分展示 Promise 与完播补证。
  evidence?: string
  // os 是公开系统分类。
  os: string
  // tiktokVersion 是官方公开版本。
  tiktokVersion: string
  // receivedAt 是阶段接收时间。
  receivedAt: string
}
// AdItem 关联一次调用的各阶段，标识均按字符串处理。
export interface AdItem {
  // userId 是认证内部用户标识。
  userId: string
  // eventId 是固定广告调用键。
  eventId: string
  // occurredAt 是请求所属 UTC 时间。
  occurredAt: string
  // adType 是广告类型。
  adType: string
  // adUnitId 是实际广告位。
  adUnitId: string
  // scene 是入口。
  scene: string
  // clientVersion 是 Mini 构建。
  clientVersion: string
  // requested 表示已调用 show。
  requested: number
  // shown 表示已确认展示。
  shown: number
  // completed 表示激励完播。
  completed: number
  // failed 可与 shown 同时成立。
  failed: number
  // cancelled 表示激励未完播。
  cancelled: number
  // unknown 表示曾经超时，需结合后续事实判断。
  unknown: number
  // closed 表示已收到原生关闭。
  closed: number
  // skipped 表示本地拦截。
  skipped: number
  // events 是阶段明细。
  events: AdEvent[]
}
// AdAnalytics 是同一筛选范围的总计、趋势、错误与游标页。
export interface AdAnalytics {
  // summary 是客户端漏斗总计。
  summary: AdSummary
  // daily 按请求日期归属。
  daily: (AdSummary & { /** date 是 UTC 自然日。 */ date: string })[]
  // errors 按实际阶段、码和原因分组。
  errors: { /** stage 是失败阶段。 */ stage: string; /** errorCode 是官方码。 */ errorCode: string; /** subErrorCode 是子码。 */ subErrorCode: string; /** reason 是固定分类。 */ reason: string; /** count 是次数。 */ count: number }[]
  // items 是当前页调用。
  items: AdItem[]
  // hasMore 表示有后续页。
  hasMore: boolean
  // nextCursor 绑定条件和应用。
  nextCursor: string
  // generatedAt 是查询时间。
  generatedAt: string
}
