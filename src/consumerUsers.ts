// ConsumerUser 是按应用读取的观众资料，不包含平台身份摘要或凭据。
export interface ConsumerUser {
  // id 是内部用户主键字符串，不能转成 JavaScript 数字。
  id: string
  // applicationId 是所属应用的内部主键字符串。
  applicationId: string
  // identityType 区分 TikTok 用户与开发环境访客。
  identityType: 'tiktok' | 'guest'
  // createdAt 是首次创建时间，不代表最近登录。
  createdAt: string
}

// ConsumerUserQuery 是服务端分页与精确用户 ID 筛选条件。
export interface ConsumerUserQuery {
  // cursor 是上一页返回的定位值；首页不传。
  cursor?: string
  // pageSize 是每页条数，最大 100。
  pageSize: number
  // userId 为空时查询当前应用全部用户。
  userId?: string
}

// ConsumerUserPage 是当前应用同一筛选条件的游标页。
export interface ConsumerUserPage {
  // items 是按创建时间和数值 ID 倒序排列的用户。
  items: ConsumerUser[]
  // hasMore 表示还有后续记录。
  hasMore: boolean
  // nextCursor 定位下一页，末页为空。
  nextCursor: string
  // pageSize 回显服务端每页数量。
  pageSize: number
}
