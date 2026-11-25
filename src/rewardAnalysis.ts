/** RewardCounts 只描述已落账奖励，人数按应用与用户标识去重。 */
export interface RewardCounts {
  /** rewardCompletions 是奖励结算次数。 */
  rewardCompletions: number
  /** rewardUsers 不保证跨小程序同一真人去重。 */
  rewardUsers: number
}
/** RewardReportQuery 显式区分所有小程序、单应用及排行时间范围。 */
export interface RewardReportQuery {
  /** applicationId 为空表示所有小程序，非空使用内部应用标识。 */
  applicationId: string
  /** from 为 UTC 开始日期。 */
  from: string
  /** to 为 UTC 结束日期，包含当天。 */
  to: string
  /** range 仅影响排行和分集，趋势始终使用日期。 */
  range: 'all' | 'range'
}
/** DramaRewardRank 合并共享剧在所选应用中的逐集奖励。 */
export interface DramaRewardRank extends RewardCounts {
  /** dramaId 是共享剧标识。 */
  dramaId: string
  /** title 是当前剧名或历史标识。 */
  title: string
}
/** CampaignRewardContribution 保留投放链接的应用与落地剧归属。 */
export interface CampaignRewardContribution extends RewardCounts {
  /** campaignId 是投放链接记录标识。 */
  campaignId: string
  /** applicationId 是链接所属应用内部标识。 */
  applicationId: string
  /** applicationName 是链接所属应用名称。 */
  applicationName: string
  /** name 是投放名称。 */
  name: string
  /** code 是投放入口编码。 */
  code: string
  /** landingUrl 是保存的官方投放链接。 */
  landingUrl: string
  /** dramaTitle 仅表示落地剧，奖励可能实际发生在其他剧。 */
  dramaTitle: string
  /** episodeRewards 是逐集奖励结算次数。 */
  episodeRewards: number
  /** vipRewards 是 VIP 广告进度奖励次数，不等于 VIP 激活次数。 */
  vipRewards: number
}
/** RewardAnalysis 是同一范围的贡献排行和无剧归属 VIP 汇总。 */
export interface RewardAnalysis {
  /** dramas 是逐集奖励贡献前 50 名。 */
  dramas: DramaRewardRank[]
  /** campaigns 是已归因链接贡献前 50 名。 */
  campaigns: CampaignRewardContribution[]
  /** unassignedVip 不计入剧目榜。 */
  unassignedVip: RewardCounts
}
/** EpisodeRewardRow 按奖励目标集序汇总，不代表播放量。 */
export interface EpisodeRewardRow extends RewardCounts {
  /** episodeNumber 为 0 表示历史目标集序未知。 */
  episodeNumber: number
}
/** RewardTrendDay 是 UTC 日的结算和当日去重人数。 */
export interface RewardTrendDay extends RewardCounts {
  /** date 为 UTC 日期。 */
  date: string
}
/** RewardTrend 对总人数独立去重，不能累加每日人数。 */
export interface RewardTrend {
  /** days 按日期连续补零。 */
  days: RewardTrendDay[]
  /** total 为范围内结算及去重人数。 */
  total: RewardCounts
}

/** RewardReportSummary 汇总所有筛选结果，人数独立去重且不受分页影响。 */
export interface RewardReportSummary extends RewardCounts {
 /** 总次数除以范围去重人数，无奖励用户时为 null。 */
 averageRewards: number | null
 /** 剧集解锁奖励结算次数。 */
 episodeRewards: number
 /** VIP 广告进度奖励次数，不是 VIP 领取次数。 */
 vipRewards: number
}

/** ReportAdShows 是应用日期范围展示回调统计，不具备剧目或链接归因。 */
export interface ReportAdShows {
 /** 激励与插屏展示次数之和。 */
 total: number
 /** 激励广告展示成功回调数。 */
 rewarded: number
 /** 插屏广告展示成功回调数。 */
 interstitial: number
 /** 原始事件保留窗口首个 UTC 日期。 */
 availableFrom: string
 /** 日期范围是否全部位于原始事件保留窗口。 */
 complete: boolean
}
