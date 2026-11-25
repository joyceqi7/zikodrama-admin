/** 应用配置的变现方式，具体解锁条件由该应用策略维护。 */
export type ApplicationMonetizationMode = 'IAA' | 'IAP' | 'IAA+IAP'

/** ApplicationStatus 控制应用是否可用于消费者请求。 */
export type ApplicationStatus = 'active' | 'disabled'

/** ApplicationAdUnits 保存应用在 TikTok Developer Portal 登记的广告位编码。 */
export interface ApplicationAdUnits {
  /** 激励视频候选广告位，服务端按用户 UID 取模分配并向 Mini 下发单个编码。 */
  rewardedVideo: string[]
  /** 插屏广告位，应用启动时使用该编码。 */
  interstitial: string[]
}

/** Application 表示运营后台维护的一个 TikTok Minis 应用。 */
export interface Application {
	/** 应用的审核版本和开关只读摘要；设置和清单分别在独立菜单维护。 */
	miniReview?: MiniReviewSettings
  /** subjectId 是固定发布归属，独立播放器仍使用共享 VOD。 */
  subjectId: string
  /** 当前播放链路，可在新版 Mini 上线后按修订切换，历史数据缺省官方。 */
  playbackProvider?: 'tiktok_minis' | 'byteplus_web'
  /** 播放编辑的并发修订，历史无绑定应用使用 0。 */
  playbackRevision?: number
  /** 数据库自增主键的十进制字符串，避免大整数精度丢失。 */
  id: string
  /** 运营后台展示的应用名称。 */
  name: string
  /** 应用公开 Logo 地址。 */
  logoUrl: string
  /** 唯一业务身份，即官方 TikTok AppID；保留原始字符串和前导零。 */
  tiktokAppId: string
  /** 当前应用调用官方接口的 Client Key。 */
  clientKey: string
  /** 服务端是否已保存当前应用的密钥；不包含密钥原文。 */
  clientSecretConfigured?: boolean
  /** 历史配置的服务端密钥引用名，不保存明文密钥。 */
  secretRef: string
  /** 应用主要运营市场，GLOBAL 表示未限定。 */
  regionCode: string
  /** 应用业务周期使用的 IANA 时区。 */
  timeZone: string
  /** 已有应用的合规页面根地址。 */
  complianceBaseUrl: string
  /** 在当前应用登记的官方广告位编码。 */
  adUnits: ApplicationAdUnits
  /** 应用级变现方式：广告、内购或混合。 */
  monetizationMode: ApplicationMonetizationMode
  /** 应用启用状态，停用后拒绝消费者解析。 */
  status: ApplicationStatus
  /** 应用登记时间。 */
  createdAt: string
  /** 应用配置最近保存时间。 */
  updatedAt: string
}

/** MiniReviewSettings 用于独立审核开关菜单，不提供应用资料或内容清单编辑能力。 */
export interface MiniReviewSettings {
	/** versions 是手动登记的包版本；每个版本独立控制审核开关。 */
	versions?: MiniReviewVersion[]
	/** version 兼容旧服务端单版本响应，新写入使用 versions。 */
	version?: string
	/** enabled 兼容旧服务端单版本响应。 */
	enabled?: boolean
	/** revision 是打开表单时的审核配置修订。 */
	revision: number
}

/** MiniReviewVersion 独立控制一个包版本，内容清单在应用内共用。 */
export interface MiniReviewVersion {
  /** version 与 Mini 随包发送的三段版本号完全一致。 */
  version: string
  /** enabled 只影响该版本的首页和纯 IAA 解锁策略。 */
  enabled: boolean
}

/** ReviewWhitelist 是加白管理菜单的应用首页内容清单。 */
export interface ReviewWhitelist {
	/** revision 与应用审核设置共享并发修订。 */
	revision: number
	/** dramaIds 保留有序引用，失效项可移除。 */
	dramaIds: string[]
	/** dramas 只包含仍可见的线上摘要。 */
	dramas: { id: string; title: string; coverUrl: string }[]
}

/** ApplicationInput 是应用整体更新合同。 */
export type ApplicationInput = Omit<Application, 'id' | 'createdAt' | 'updatedAt' | 'clientSecretConfigured'> & {
  /** 仅提交新密钥；省略或空字符串保留已有值。 */
  clientSecret?: string
}

/** ApplicationCreateInput 是新建应用所需的最小合同。 */
export interface ApplicationCreateInput {
  /** 新建时可同时登记激励和插屏广告位，沿用服务端现有字段。 */
  adUnits?: ApplicationAdUnits
  /** subjectId 是创建应用时明确选择的主体。 */
  subjectId: string
  /** 新建应用的播放链路，省略时默认官方。 */
  playbackProvider?: 'tiktok_minis' | 'byteplus_web'
  /** 当前应用自己的 Client Secret，创建必填，仅提交给服务端。 */
  clientSecret: string
  /** 当前应用的 Client Key，创建时必填，保存后不可更换。 */
  clientKey: string
  /** 新建时必须明确选择模式，表单默认 IAA。 */
  monetizationMode: ApplicationMonetizationMode
  /** TikTok 开发者平台分配的应用 ID，始终按字符串提交。 */
  tiktokAppId: string
  /** 运营后台展示的应用名称。 */
  name: string
}

/** ApplicationOption 只用于顶部安全选择，不包含应用凭据、广告配置或写入资料。 */
export type ApplicationOption = Pick<Application,'id'|'subjectId'|'name'|'tiktokAppId'|'status'|'playbackProvider'> & {
  /** clientKeyConfigured 是安全摘要，只说明官方授权所需 Client Key 是否存在。 */
  clientKeyConfigured?: boolean
}

/** DistributionApplication 只承载分发候选所需字段，不要求读取完整应用资料。 */
export type DistributionApplication = ApplicationOption & {
  /** clientKey 仅兼容已加载完整应用资料的调用方，新选项接口只提供配置状态。 */
  clientKey?: string
}
