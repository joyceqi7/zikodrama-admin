import type { RewardReportSummary, ReportAdShows } from './rewardAnalysis'
import type { RewardReportQuery } from './rewardAnalysis'
/** DramaReportQuery 固定使用所选日期，空应用标识表示所有小程序。 */
export interface DramaReportQuery extends RewardReportQuery {
  /** 剧名包含查询或全数字剧 ID 精确查询。 */
  query: string
  /** 从 1 开始的页码。 */
  page: number
  /** 当前页条数。 */
  pageSize: number
  /** 服务端排序白名单。 */
  sort: 'unlockCount' | 'playUsers' | 'firstEpisodeCompletionRate' | 'unlockUsers' | 'averageUnlocks'
  /** 升降序，空值排最后。 */
  direction: 'asc' | 'desc'
}
/** DramaReportRow 是共享剧四个核心指标，未采集不显示为零。 */
export interface DramaReportRow {
  /** 剧内部标识。 */
  dramaId: string
  /** 当前剧名。 */
  title: string
  /** 播放去重人数，未具备归因采集时为 null。 */
  playUsers: number | null
  /** 首集完播比例（0–1），未采集时为 null。 */
  firstEpisodeCompletionRate: number | null
  /** 逐集广告奖励的应用和用户去重数。 */
  unlockUsers: number
  /** 成功结算次数，不等于批量授予集数。 */
  unlockCount: number
  /** 结算次数除以领取人数，无领取者时为 null。 */
  averageUnlocks: number | null
}
/** DramaReportPage 包含零解锁剧的真实分页结果。 */
export interface DramaReportPage {
 /** 同应用日期范围广告展示统计，不受名称搜索或分页影响。 */
 adShows?: ReportAdShows
  /** 全部匹配结果的范围汇总，人数不按各行相加。 */
  summary: RewardReportSummary
  /** 当前页指标。 */
  items: DramaReportRow[]
  /** 匹配共享剧总数。 */
  total: number
}
