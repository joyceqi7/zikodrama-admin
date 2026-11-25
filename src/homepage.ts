// CarouselItem 是单个轮播位，创建时间由服务端维护。
export interface CarouselItem {
 // dramaId 是关联短剧。
 dramaId: string
 // title 留空使用线上剧名。
 title: string
 // visible 控制前台展示。
 visible: boolean
 // createdAt 是服务端生成的时间，历史记录可能为空。
 createdAt: string
}

// CarouselDrama 是当前主体与渠道的已上线剧目摘要，轮播默认使用其封面。
export interface CarouselDrama {
  // id 是内部短剧字符串标识。
  id: string
  // title 是当前线上标题。
  title: string
  // coverUrl 是当前线上封面，不是视频地址。
  coverUrl: string
}

// CarouselConfig 整体保存有序剧目引用，revision 防止覆盖并发修改。
export interface CarouselConfig {
  // revision 是读取时的并发版本。
  revision: number
  // dramaIds 是完整展示顺序，空数组清空轮播。
  dramaIds: string[]
 // items 保存标题、展示状态和顺序。
 items?: CarouselItem[]
}

// CarouselView 保留失效引用，并为可见剧目补充展示资料。
export interface CarouselView extends CarouselConfig {
 /** metadata 给运营提供当前线上版本与有效应用数。 */
 metadata?:Record<string,{version:number;applications:number}>
  // dramas 不包含已下架的剧目，消费者展示时另按应用授权过滤。
  dramas: CarouselDrama[]
}

// CarouselTargets 是可选剧目的搜索分页。
export interface CarouselTargets {
  /** metadata 仅由直连运营查询补充，用于候选的版本和有效应用提示。 */
  metadata?: Record<string, { version: number; applications: number }>
  // items 是本页可见剧目。
  items: CarouselDrama[]
  // nextCursor 为空表示已到末页。
  nextCursor?: string
}
