// DashboardDay 是按 UTC 日期汇总的业务账本数据。
export interface DashboardDay {
  // date 为 UTC 日期。
  date: string
  // newUsers 为首次创建的应用内用户数。
  newUsers: number
  // rewardCompletions 为广告奖励结算次数。
  rewardCompletions: number
  // episodeUnlocks 为逐集权益授予集数。
  episodeUnlocks: number
  // activeUsers 是当日成功上报事实的去重用户数，旧服务端可能未返回。
  activeUsers?: number
  // launches 是启动次数。
  launches?: number
  // playStarts 是实际播放开始次数。
  playStarts?: number
  // playCompletions 是已匹配开始事实的完播数，按开始日期归属。
  playCompletions?: number
  // rewardedShows 是激励广告展示成功数。
  rewardedShows?: number
  // adCompletions 是匹配展示事实的完整观看数。
  adCompletions?: number
  // interstitialShows 是插屏展示成功数。
  interstitialShows?: number
  // tiktokPostbackAttempts 是尝试调用 TikTok 官方关键行为回传的次数。
  tiktokPostbackAttempts?: number
  // tiktokPostbackSuccesses 是 TikTok SDK 明确确认成功的回传次数。
  tiktokPostbackSuccesses?: number
  // tiktokPostbackFailures 是能力缺失、调用异常或官方拒绝的回传次数。
  tiktokPostbackFailures?: number
  // vipActivations 为 VIP 权益授予次数。
  vipActivations: number
}
// AnalyticsDashboard 包含查询时间和连续每日数据。
export interface AnalyticsDashboard {
  // timeZone 为统计时区。
  timeZone: string
  // generatedAt 为本次查询完成时间。
  generatedAt: string
  // audience 的 MAU 以范围末日为终点，向前 30 日去重；空值兼容旧服务端。
  audience?: {
    // monthlyActiveUsers 不得通过相加每日活跃计算。
    monthlyActiveUsers: number | null
    // firstReceivedAt 是本应用首次成功采集时间；null 表示尚无采集事实。
    firstReceivedAt: string | null
  }
  // campaignRanking 为当前范围按奖励结算次数排序的前 50 名；缺失兼容旧服务端。
  campaignRanking?: CampaignRewardRank[]
  // days 是按日期排序的连续日统计。
  days: DashboardDay[]
}

// CampaignRewardRank 展示已归因投放链接的奖励贡献，不代表广告曝光。
export interface CampaignRewardRank {
  // campaignId 是应用内投放记录标识。
  campaignId: string
  // name 是投放配置名称。
  name: string
  // code 是稳定入口编码。
  code: string
  // landingUrl 是官方生成的链接。
  landingUrl: string
  // rewardCompletions 是幂等结算次数。
  rewardCompletions: number
  // rewardUsers 是范围内去重领取人数。
  rewardUsers: number
}
