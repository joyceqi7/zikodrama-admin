// CampaignTarget 是服务端按当前小程序授权结果筛选后的线上内容，不得用草稿替代。
export interface CampaignTarget {
  // ID 是内部短剧标识。
  id: string
  // Title 是线上名称。
  title: string
  // Version 是官方线上版本。
  version: number
  // Episodes 是线上分集选择项，不包含播放凭据。
  episodes: Array<{ id: string; number: number; title: string }>
}
