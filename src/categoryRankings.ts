import type { TikTokTag } from './domain'
import type { CarouselDrama } from './homepage'

// RankingItem 保存分类内顺序和展示状态。
export interface RankingItem {
  // dramaId 是内部短剧字符串标识。
  dramaId: string
  // visible 仅控制当前分类榜单的展示。
  visible: boolean
}
// RankingConfig 整体保存单个官方标签下的榜单。
export interface RankingConfig {
  // revision 防止覆盖其他管理员的修改。
  revision: number
  // items 保存自动关联成员及顺序，包含隐藏项。
  items: RankingItem[]
}
// RankingView 提供全局分类及线上摘要。
export interface RankingView extends RankingConfig {
 /** metadata 给直连运营提供版本与有效应用数。 */
 metadata?:Record<string,{version:number;applications:number}>
  // dramas 仅包含仍获授权、已发布且属于当前标签的短剧。
  dramas: CarouselDrama[]
}
// RankingCategory 提供官方标签和完整配置数量。
export interface RankingCategory {
  // tag 的英文翻译来自独立的 TikTok 标签维护页。
  tag: TikTokTag
  // count 包括全部自动关联项，隐藏不减少数量。
  count: number
}
