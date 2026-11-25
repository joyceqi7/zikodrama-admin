import type { RewardReportSummary, ReportAdShows } from './rewardAnalysis'
import type { CampaignRewardContribution, RewardReportQuery } from './rewardAnalysis'

/** CampaignReportQuery 按已提交的应用、日期和名称或编码筛选独立链接。 */
export interface CampaignReportQuery extends RewardReportQuery {
  /** 投放名称或编码的包含查询，不把百分号当通配符。 */
  query: string
  /** 从 1 开始的页码。 */
  page: number
  /** 每页 1–100 条。 */
  pageSize: number
  /** 三个核心指标的白名单排序。 */
  sort: 'rewardCompletions' | 'rewardUsers' | 'averageRewards'
  /** 升降序，零分母的人均值保持在末尾。 */
  direction: 'asc' | 'desc'
}

/** CampaignReportRow 保留链接所属小程序、落地剧及逐集／VIP 奖励拆分。 */
export interface CampaignReportRow extends CampaignRewardContribution {
  /** 成功奖励结算次数除以领取人数，零人数时为 null。 */
  averageRewards: number | null
  /** 停用链接的历史奖励仍参与统计。 */
  status: string
}

/** CampaignReportPage 包含零奖励链接的真实分页结果。 */
export interface CampaignReportPage {
 /** 同应用日期范围广告展示统计，不受名称搜索或分页影响。 */
 adShows?: ReportAdShows
  /** 全部匹配结果的范围汇总，人数不按各行相加。 */
  summary: RewardReportSummary
  /** 同应用日期范围未归因奖励，不受链接名称搜索影响。 */
  unattributed: RewardReportSummary
  /** 当前页独立链接指标。 */
  items: CampaignReportRow[]
  /** 应用和搜索条件匹配的全部链接数。 */
  total: number
}
