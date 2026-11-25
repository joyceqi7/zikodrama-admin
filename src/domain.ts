import type { ApplicationMonetizationMode } from './applications'
import type { DirectSummary } from './directPlayback'

export type {
  Application,
  ApplicationAdUnits,
  ApplicationCreateInput,
  ApplicationInput,
  ApplicationMonetizationMode,
  ApplicationStatus,
} from './applications'

export interface Overview {
  dramaCount: number
  episodeCount: number
  publishedCount: number
	pendingMediaCount: number
	mediaCleanupCount: number
}

export type AdminStatus = 'active' | 'disabled'

export interface AdminUser {
  id: string
  username: string
  nickname: string
  status: AdminStatus
  isSuper: boolean
  roleIds: string[]
  createdAt: string
  updatedAt: string
}

export interface AdminRole {
  id: string
  name: string
  code: string
  remark: string
  status: AdminStatus
  permissionIds: string[]
  createdAt: string
  updatedAt: string
}

// AdminPermissionType 区分仅用于组织的目录、导航菜单和接口操作。
export type AdminPermissionType = 'directory' | 'menu' | 'action'

// AdminPermissionInput 是可维护的权限节点资料。
export interface AdminPermissionInput {
  // parentId 为空表示根节点，父节点停用会使整个子树失效。
  parentId: string
  // name 是自定义显示名称。
  name: string
  // code 是唯一编码，操作权限码必须与业务接口对应。
  code: string
  // type 决定节点的导航和授权语义。
  type: AdminPermissionType
  // route 是页面节点绑定的站内路径，其他节点为空。
  route: string
  // icon 是目录或页面使用的 Lucide 图标名称。
  icon?: string
  // sortOrder 决定同级展示顺序。
  sortOrder: number
  // status 控制当前节点及后代是否启用。
  status: AdminStatus
  // remark 是权限用途说明。
  remark: string
}

// AdminPermission 以稳定自增主键保留角色关联。
export interface AdminPermission extends AdminPermissionInput {
  // id 是无精度损失的十进制主键字符串。
  id: string
  // createdAt 是创建时间。
  createdAt: string
  // updatedAt 是最近修改时间。
  updatedAt: string
}

// AdminMenu 是服务端按授权和配置顺序生成的导航树。
export interface AdminMenu {
  // id 是目录或菜单的稳定标识。
  id: string
  // name 是自定义导航名称。
  name: string
  // route 是已授权页面的站内路径，目录为空。
  route: string
  // icon 是导航节点配置的 Lucide 图标名称。
  icon?: string
  // children 是按配置排序的可见子节点。
  children: AdminMenu[]
}

// AdminSession 同时提供有效操作权限和动态导航树，接口始终由服务端鉴权。
export interface AdminSession {
  // user 是当前已认证的运营账号。
  user: AdminUser
  // permissions 只包含有效操作码，目录和菜单编码不会授予接口能力。
  permissions: string[]
  // menus 是当前账号可见的菜单树。
  menus: AdminMenu[]
}

export interface AdminUserCreateInput {
  username: string
  password: string
  nickname: string
  status: AdminStatus
}

export interface AdminUserUpdateInput {
  nickname: string
  status: AdminStatus
}

export interface AdminRoleInput {
  name: string
  code: string
  remark: string
  status: AdminStatus
}

export const permissionCodes = {
  // consumerUserRead 允许按应用查看观众用户列表。
  consumerUserRead: 'operations.consumer_user.read',
  // dashboardRead 读取应用仪表盘汇总。
  dashboardRead: 'operations.dashboard.read',
  // adAnalyticsRead 独立读取广告调用漏斗和诊断。
  adAnalyticsRead: 'operations.ad_analytics.read',
  /** 读取独立剧目报表，不自动继承仪表盘权限。 */
  dramaReportRead: 'operations.drama_report.read',
  /** 跨小程序只读链接奖励贡献，不包含投放配置修改权。 */
  campaignReportRead: 'operations.campaign_report.read',
  // postbackLogRead 读取应用内已脱敏的 TikTok 关键行为回传日志。
  postbackLogRead: 'operations.postback_log.read',
  // rankingRead 允许读取分类榜单及候选。
  rankingRead: 'operations.ranking.read',
  // rankingUpdate 允许维护分类榜单排序和展示。
  rankingUpdate: 'operations.ranking.update',
  // hotRead 读取当前应用人工热播及候选短剧。
  hotRead: 'operations.hot.read',
  // hotUpdate 修改当前应用人工热播配置。
  hotUpdate: 'operations.hot.update',
  // carouselRead 读取轮播和当前应用可选短剧。
  carouselRead: 'operations.carousel.read',
  // carouselUpdate 整体替换轮播引用与顺序。
  carouselUpdate: 'operations.carousel.update',
  subjectRead: 'subjects.read',
  subjectCreate: 'subjects.create',
  subjectUpdate: 'subjects.update',
  applicationRead: 'applications.read',
  applicationCreate: 'applications.create',
  applicationUpdate: 'applications.update',
  dramaRead: 'content.drama.read',
  dramaCreate: 'content.drama.create',
  dramaUpdate: 'content.drama.update',
  dramaDelete: 'content.drama.delete',
  mediaUpload: 'content.media.upload',
  dramaPublish: 'content.drama.publish',
  dramaSync: 'content.drama.sync',
  dramaReview: 'content.drama.review',
  dramaRelease: 'content.drama.release',
  dramaDistribute: 'content.drama.distribute',
  // tiktokTagUpdate 只授权维护英文展示名。
  tiktokTagUpdate: 'content.tiktok_tag.update',
  // tiktokTagRead 允许读取官方目录及翻译。
  tiktokTagRead: 'content.tiktok_tag.read',
  campaignRead: 'operations.campaign.read',
  campaignCreate: 'operations.campaign.create',
  campaignUpdate: 'operations.campaign.update',
  // 全局配置读取与编辑权限相互独立。
  configRead: 'system.config.read',
  configUpdate: 'system.config.update',
  auditRead: 'audit.read',
  userRead: 'rbac.user.read',
  userCreate: 'rbac.user.create',
  userUpdate: 'rbac.user.update',
  userReset: 'rbac.user.reset_password',
  userAssignRole: 'rbac.user.assign_role',
  roleRead: 'rbac.role.read',
  roleCreate: 'rbac.role.create',
  roleUpdate: 'rbac.role.update',
  roleDelete: 'rbac.role.delete',
  roleAssign: 'rbac.role.assign_permission',
  permissionRead: 'rbac.permission.read',
  // 权限树维护使用独立的增删改权限。
  permissionCreate: 'rbac.permission.create',
  permissionUpdate: 'rbac.permission.update',
  permissionDelete: 'rbac.permission.delete',
} as const

export type CampaignStatus = 'active' | 'disabled'

export interface Campaign {
  id: string
  applicationId: string
  code: string
  name: string
  landingUrl: string
  externalCampaignId: string
  externalAdGroupId: string
  externalAdId: string
  externalCreativeId: string
  dramaId: string
  episodeId: string
  experimentKey: string
  status: CampaignStatus
  createdAt: string
  updatedAt: string
}

export interface CampaignInput {
  code?: string
  name: string
  externalCampaignId: string
  externalAdGroupId: string
  externalAdId: string
  externalCreativeId: string
  dramaId: string
  episodeId: string
  experimentKey: string
  status: CampaignStatus
}

/** 运营短剧分集及当前权威媒资状态，上传任务详情由 media_jobs 接口读取。 */
export interface Episode {
  /** 分集业务标识，始终按字符串处理。 */
  id: string
  /** 所属短剧业务标识。 */
  dramaId: string
  /** 当前草稿中的分集序号。 */
  number: number
  /** 分集主标题。 */
  title: string
  /** 分集主简介。 */
  description: string
  /** BytePlus 当前视频 VID，按字符串保留。 */
  vid: string
  /** 源 VID 所属媒资空间，用于比较直连草稿和线上版本。 */
  mediaSpaceName?: string
  /** TikTok Album Update 生成的官方分集标识，用于定位审核意见。 */
  platformEpisodeId?: string
  /** 分集公开海报地址。 */
  posterUrl: string
  /** 原片时长，单位秒。 */
  durationSeconds: number
  /** 媒资处理状态，ready 表示可进入发布流程。 */
  mediaStatus: 'pending' | 'processing' | 'ready' | 'failed' | string
}






export interface MediaJob {
  jobId: string
  episodeId: string
  fileName: string
  size: number
  remoteVid?: string
  uploadRequestId?: string
  /** reserved 仅表示授权预留；其他状态由服务端上传与处理任务推进。 */
  status: 'reserved' | 'uploading' | 'queued' | 'running' | 'processing' | 'succeeded' | 'failed'
  error?: string
  episode?: Episode
  createdAt: string
  updatedAt: string
}

export interface MediaUploadToken {
  AccessKeyID: string
  SecretAccessKey: string
  SessionToken: string
  ExpiredTime: string
  CurrentTime: string
}

export interface MediaUploadAction {
  Name: 'GetMeta' | 'StartWorkflow' | 'Snapshot' | 'AddOptionInfo'
  input?: Record<string, string>
}

export interface MediaUploadAuthorization {
  mode: 'direct'
  appId?: string
  spaceName?: string
  region?: string
  maxFileBytes: number
  token?: MediaUploadToken
  processActions?: MediaUploadAction[]
  callbackArgs?: string
}

export interface EpisodeMediaUploadReservation {
  uploadId: string
  authorization: MediaUploadAuthorization
}

export interface DirectMediaUploadInput {
  uploadId: string
  vid: string
  uploadRequestId: string
  fileName: string
  size: number
}

export interface CoverAsset {
  uploadId: string
  mid: string
  id: string
  url: string
}

export type DramaStatus = 'unpublished' | 'updating' | 'completed'


// TikTokTag 保留不可变的官方身份和可维护的英文展示名。
export interface TikTokTag {
  // id 是官方字符串标识。
  id: string
  // officialName 是内置官方原名，后台不可修改。
  officialName: string
  // englishName 是英文翻译，旧服务端省略或空值时回退官方名称。
  englishName?: string
}


// TikTokTagSummary 是全局标签目录及当前主体的关联统计。
export interface TikTokTagSummary extends TikTokTag {
  // dramaCount 包含未上线短剧；旧后端缺少字段时显示未知，不能作为零处理。
  dramaCount?: number
}

export type TikTokAlbumLanguage = 'ar' | 'de' | 'en' | 'es' | 'fr' | 'id' | 'it' | 'ja' | 'kk' | 'ko' | 'pl' | 'pt' | 'ro' | 'ru' | 'th' | 'tr' | 'ug' | 'vi' | 'zh'

export type TikTokDramaType = 1 | 2 | 3 | 4

export interface DramaMetadataReference {
  schemaVersion: string
  sourceUrl: string
	statuses: Array<{ value: DramaStatus; label: string }>
  languages: Array<{ value: TikTokAlbumLanguage; label: string }>
  dramaTypes: Array<{ value: TikTokDramaType; label: string }>
  tags: TikTokTag[]
}

export interface Drama {

	/** 当前发布链路负责人。 */
	assignee?: string
	/** 发布链路交接备注。 */
	operationNote?: string
	/** SLA 截止时间；为空表示未设置。 */
	operationDueAt?: string
	// OnlineVersion 是仍在对观众提供服务的版本，与编辑状态独立。
	onlineVersion?: number
	/** 服务端已上线快照的集序号，不从当前编辑内容推测。 */
	onlineEpisodeNumbers?: number[]
	id: string
  title: string
  description: string
  coverUrl: string
  tags: string[]
  status: DramaStatus
  year: number
  language: TikTokAlbumLanguage
  dramaType: TikTokDramaType
  tagIds: string[]
	publishStatus: PublishStatus
  episodes: Episode[]
}

export interface DramaOperationsInput {
  assignee: string
  note: string
  dueAt?: string | null
}



// PublishStatus 是编辑与发布任务状态；线上可见性由独立的线上版本决定。
export type PublishStatus = 'draft' | 'publishing' | 'published' | 'unpublishing' | string

// TikTokPublicationPriority 映射 TikTok 官方审核优先级，urgent 存在组织级每日额度。
export type TikTokPublicationPriority = 'normal' | 'urgent'

// TikTokPublicationStatus 是管理端可稳定展示的官方发布编排状态。
export type TikTokPublicationStatus = 'queued' | 'processing' | 'synced' | 'under_review' | 'approved' | 'rejected' | 'failed' | 'online' | 'offline'

// TikTokPublicationStage 是系统下一步或刚失败的 TikTok 官方处理阶段。
export type TikTokPublicationStage =
  | 'appeal_review' | 'poll_appeal' | 'withdraw_review'
  | 'upload_cover'
  | 'create_album'
  | 'register_videos'
  | 'transcode_videos'
  | 'update_album'
  | 'await_submit_review'
  | 'submit_review'
  | 'poll_review'
  | 'await_publish'
  | 'set_online_version'
  | 'list_album'
  | 'delist_album'
  | 'done'

// TikTokPublicationInput 是运营人员提交审核时的选择，上线需另行确认。
export interface TikTokPublicationInput {
  // priority 控制官方审核优先级，拥有方与分发目标由服务端配置决定。
  priority: TikTokPublicationPriority
}

// TikTokPublication 是一次可恢复的 TikTok 官方发布任务；平台标识始终按字符串处理。
// TikTokReviewAppealInput 为单个被拒的官方对象提供申诉证据。
export interface TikTokReviewAppealInput {
  // itemType 区分剧目和剧集。
  itemType: 1 | 2
  // itemId 是当前版本映射中的平台 ID。
  itemId: string
  // reason 是提交到 TikTok 的申诉理由。
  reason: string
  // attachmentUrls 最多十条 HTTPS 证据地址，单文件不超过 200 MB。
  attachmentUrls?: string[]
}

export interface TikTokPublication {
  /** 当前已就绪内容与此任务冻结内容不同，不改变原任务范围。 */
  currentContentChanged: boolean

  /** 本次固定内容范围；旧任务缺省时页面明确提示未知。 */
  contentSummary?: {
    /** 本次同步的完整集序号。 */
    episodeNumbers: number[]
    /** 同步前线上范围；空数组为首次发布，null 为历史范围未知。 */
    previousEpisodeNumbers: number[] | null
  }
  // appeal 为最近一次单项申诉的输入。
  appeal?: TikTokReviewAppealInput
  // reviewItems 为平台查询得到的单项审核状态。
  reviewItems?: Record<string, number>
  // Videos 展示官方媒资登记确认进度。
  videos?: Array<{ episodeId: string; vid: string; status: string }>
  // Transcodes 展示官方转码批次完成情况。
  transcodes?: Array<{
    // TaskId 是官方批量转码任务标识。
    taskId?: string
    // Vids 是原批次的视频集合。
    vids: string[]
    // Ready 表示整批已核对完成。
    ready: boolean
    // CompletedVids 是官方已确认完成的分集集合。
    completedVids?: string[]
    // StartedAt 是任务开始观察的时间。
    startedAt?: string
    // LastProgressAt 仅在完成分集增加时推进。
    lastProgressAt?: string
    // LastCheckedAt 是最近一次有效查询的时间。
    lastCheckedAt?: string
    // MonitoringStartedAt 是人工恢复后的本轮观察起点。
    monitoringStartedAt?: string
  }>
  // Authorizations 按小程序独立反馈，失败不影响其他应用播放。
  // ReviewFailReasons 是官方返回的当前版本审核意见。
  reviewFailReasons?: string[]
  // ID 是系统发布任务标识。
  id: string
  // DramaID 是关联的内部短剧标识。
  dramaId: string
  // OwnerApplicationID 是拥有官方 Album 的应用标识。
  ownerApplicationId: string
  // TargetApplicationIDs 是提交时冻结的目标授权应用集合。
  // Priority 是提交审核时使用的优先级。
  priority: TikTokPublicationPriority
  // Status 是管理端展示的稳定业务状态。
  status: TikTokPublicationStatus
  // Stage 是当前官方处理阶段。
  stage: TikTokPublicationStage
  // PlatformCoverID 是 TikTok Image API 返回的封面标识。
  platformCoverId?: string
  // PlatformAlbumID 是 TikTok 官方 Album 标识。
  platformAlbumId?: string
  // PlatformVersion 是当前送审的官方版本号。
  platformVersion?: number
  // ReviewID 是 TikTok 官方审核任务标识。
  reviewId?: string
  // ReviewStatus 是 Album Query 返回的官方审核状态整数。
  reviewStatus: number
  // PlatformPublishStatus 是 TikTok 返回的上下架状态整数。
  platformPublishStatus: number
  // EpisodeIDsBySequence 保存本地集序号到官方 Episode 标识的映射。
  episodeIdsBySequence?: Record<string, string>

  // ErrorCode 是可用于稳定诊断的安全错误分类。
  errorCode?: string
  // ErrorMessage 是已经封装、可直接展示给运营人员的友好错误。
  errorMessage?: string
  // DiagnosticCode 是结果未知前的安全失败分类，不包含平台响应正文。
  diagnosticCode?: string
  // Attempts 是当前任务累计失败次数。
  attempts: number
  // NextAttemptAt 是系统下一次自动处理的时间。
  nextAttemptAt: string
  // CreatedAt 是首次提交时间。
  createdAt: string
  // UpdatedAt 是最近状态更新时间。
  updatedAt: string
  // SubmittedAt 是 TikTok 受理审核的时间。
  submittedAt?: string
  // OnlineAt 是 TikTok 完成上架的时间。
  onlineAt?: string
}

// DramaInput 保存运营草稿；基础信息和分集清单的保存不触发视频上传。
export interface DramaInput {
  // title 是默认语言剧名。
  title: string
  // description 是默认语言简介。
  description: string
  // coverUrl 是已上传的封面地址。
  coverUrl: string
  // coverUploadId 是待消费的封面上传登记标识，保存成功后不重复提交。
  coverUploadId?: string
  // status 表示连载状态，不代表送审或上线状态。
  status: DramaStatus
  // year 是内容上线年份。
  year: number
  // language 使用官方语言代码。
  language: TikTokAlbumLanguage
  // dramaType 使用官方剧目类型枚举。
  dramaType: TikTokDramaType
  // tagIds 是官方标签的字符串标识。
  tagIds: string[]
  // episodes 是整体替换的分集清单，允许为空；已有分集必须保留 ID。
  episodes: EpisodeInput[]
}

// EpisodeInput 是草稿中的分集资料，视频通过独立媒资接口登记。
export interface EpisodeInput {
  // id 保留已有分集的字符串标识；新分集由服务端分配。
  id?: string
  // number 是从 1 连续排列的集号。
  number: number
  // title 是分集标题。
  title: string
  // description 是分集简介。
  description: string
  // posterUrl 保留服务端已确认的分集封面。
  posterUrl: string
  // durationSeconds 保留已确认的视频时长；未上传时为 0。
  durationSeconds: number
}

export const emptyDramaInput = (): DramaInput => ({
  title: '',
  description: '',
  coverUrl: '',
  status: 'updating',
  year: new Date().getFullYear(),
  language: 'zh',
  dramaType: 4,
  tagIds: [],
  episodes: [],
})

export function dramaToInput(drama: Drama): DramaInput {
  return {
    title: drama.title,
    description: drama.description,
    coverUrl: drama.coverUrl,
    status: drama.status,
    year: drama.year,
    language: drama.language,
    dramaType: drama.dramaType,
    tagIds: [...drama.tagIds],
    episodes: drama.episodes.map((episode) => ({
      id: episode.id,
      number: episode.number,
      title: episode.title,
      description: episode.description,
      posterUrl: episode.posterUrl,
      durationSeconds: episode.durationSeconds,
    })),
  }
}




export interface ApplicationVIPStrategy {
  enabled: boolean
  forceWatchCount: number
  requiredAdCount: number
  delaySeconds: number
  adUnitCode: string
  title: string
  content: string
  failureMessage: string
}


// 每个 TikTok 应用始终使用逐集激励广告解锁，并可附加 VIP 策略。
export interface ApplicationMonetization {
  /** 当前所选应用的内部标识。 */
  applicationId: string
  /** 每部剧从第一集开始的免费集数。 */
  freeEpisodeCount: number
  /** 每次广告从目标集起解锁的集数；旧服务端可能不返回此字段。 */
  unlockEpisodeCount?: number
  /** 每用户每天逐集奖励次数上限，0 表示不限；按应用时区结算。 */
  dailyRewardLimit?: number
  /** 当前应用已登记的逐集解锁激励广告位编码。 */
  episodeUnlockAdUnitCode: string
  /** 当日 VIP 与投放启动强看策略。 */
  vipStrategy: ApplicationVIPStrategy
  /** 按应用支持语言保存的 VIP 展示文案。 */
  /** 首次配置的 UTC 时间。 */
  createdAt?: string
  /** 最近保存的 UTC 时间。 */
  updatedAt?: string
}

/** 保存当前应用配置，应用归属由服务端决定。 */
export type ApplicationMonetizationInput = Omit<ApplicationMonetization, 'applicationId' | 'createdAt' | 'updatedAt'>


export interface AuditRecord {
  // id 是数据库自增主键的十进制字符串，避免长整数丢失精度。
  id: string
  requestId?: string
  actorId: string
  actorUsername: string
  applicationId?: string
  action: string
  resourceType: string
  resourceId: string
  result: 'success' | 'failed' | string
  httpStatus: number
  clientIp: string
  createdAt: string
}

// DramaListItem 仅包含列表展示字段；进入剧目后才读取 Drama 和分集。
export type DramaListItem = Pick<Drama, 'id' | 'title' | 'coverUrl' | 'status' | 'year' | 'tags' | 'publishStatus' | 'onlineVersion' | 'assignee' | 'operationDueAt'> & {
  /** 渠道引用或活动任务阻止删除；新建行未刷新列表时由服务端再次校验。 */
  deleteBlocked?: boolean
  /** 直连当前版本与修订，不代表官方审核状态。 */
  directPublication?: DirectSummary
  /** 当前线上快照已确认成功的其他小程序数量，不含发布方；旧接口缺失时显示未知。 */
  authorizedApplicationCount?: number
  /** 当前线上版本的发布方，自动可用且不占用授权数。 */
  ownerApplicationId?: string
  /** 首次创建管理员 ID，历史无法追溯时为空。 */
  createdById?: string
  /** 创建人的当前昵称或用户名，已删除管理员留空。 */
  createdByName?: string
  /** 最近成功人工修改的管理员 ID，自动任务不覆盖。 */
  updatedById?: string
  /** 最近操作人的当前昵称或用户名。 */
  updatedByName?: string
  // episodeCount 是草稿分集总数。
  episodeCount: number
  // readyEpisodeCount 是视频已就绪的分集数。
  readyEpisodeCount: number
  // publication 是最新一次官方发布任务的列表摘要；从未送审时为空。
  publication?: DramaListPublication
  /** 已选版本及独立上下架进度，审核新版本不改变此状态。 */
  officialRelease?: TikTokReleaseState
}

// DramaListPublication 是列表展示最新官方流程所需的最小任务事实。
export interface DramaListPublication {
 /** 本次同步/审核版本，与当前已选版本独立。 */
 platformVersion?: number
  /** 当前已就绪内容与此任务冻结内容不同。 */
  currentContentChanged: boolean

  /** 绑定列表所展示的审核版本；旧服务未提供时需刷新升级。 */
  id?: string
  // priority 是运营提交的普通或加急审核优先级。
  priority: TikTokPublicationPriority
  // status 是发布任务当前稳定业务状态。
  status: TikTokPublicationStatus
  // stage 是 Worker 当前处理或等待的官方阶段。
  stage: TikTokPublicationStage
  // reviewStatus 是 TikTok 最近返回的审核状态整数，零表示尚未取得审核事实。
  reviewStatus: number
  // errorCode 是任务暂停或失败时的稳定错误分类。
  errorCode?: string
}
/** TikTokReleaseState 是已确认版本及上下架操作摘要，不包含媒体快照。 */
export interface TikTokReleaseState {
 /** 页面确认的已选版本记录。 */
 selectedPublicationId?: string
 /** 已选官方版本，即使下架也保留。 */
 version: number
 /** 已确认的上下架事实。 */
 status: string

}
/** TikTokReleaseInput 只能操作页面确认的已选记录。 */
export interface TikTokReleaseInput {
 /** 请求上下架或恢复失败操作。 */
 action: 'list' | 'delist'
 /** 已确认的目标版本记录。 */
 selectedPublicationId: string
}

// DramaListQuery 是服务器分页与筛选参数。
export interface DramaListQuery {
  /** directStatus 按独立直连上下架状态筛选，不影响官方流程。 */
  directStatus?: 'unpublished' | 'published' | 'offline'
  // page 从 1 开始。
  page: number
  // pageSize 是单页大小。
  pageSize: number
  // query 匹配标题和标签。
  query?: string
  /** contentStatus 兼容旧草稿或 ready 查询，新界面使用渠道状态筛选。 */
  contentStatus?: 'draft' | 'ready'
  // publication 仅供官方发布菜单筛选官方流程。
  publication?: 'draft' | 'published' | 'needs_action' | 'waiting_platform' | 'content_incomplete' | 'manual_attention' | 'syncing' | 'await_review' | 'under_review' | 'rejected' | 'await_publish' | 'distribution_failed'
}
// DramaListPage 是服务器返回的列表摘要和总数。
export interface DramaListPage {
  // items 不包含分集。
  items: DramaListItem[]
  // total 是匹配记录总数。
  total: number
}

/** GrantTemplate 描述尚未发放的权益类型与参数；最终内容由服务端解析。 */
export interface GrantTemplate {
  /** 剧集、整剧、VIP 等权益处理器类型。 */
  type: string
  /** 当前权益类型的 JSON 配置。 */
  config: Record<string, unknown>
}

/** UnlockRule 是一项独立获取方式，可单独开启并组合多项权益。 */
export interface UnlockRule {
  /** 策略内稳定且唯一的规则编码。 */
  code: string
  /** 获取方式，例如广告、单次购买或订阅。 */
  type: string
  /** 是否允许此方式产生新入口。 */
  enabled: boolean
  /** 获取条件，由对应规则策略校验。 */
  config: Record<string, unknown>
  /** 一次完成授予的全部权益模板。 */
  grants: GrantTemplate[]
}

/** StrategyDocument 保存可复用的全部解锁规则，规则顺序即入口优先级。 */
export interface StrategyDocument {
  /** JSON 结构解释版本。 */
  schemaVersion: number
  /** 策略总开关，关闭不会撤销已发放权益。 */
  enabled: boolean
  /** 是否展示普通插屏；历史策略未配置时沿用开启行为。 */
  interstitialEnabled?: boolean
  /** 每部短剧的免费预览集数。 */
  freeEpisodeCount: number
  /** 进入首集后，入剧和强制 VIP 广告门禁开始前需播放的秒数。 */
  entryAdDelaySeconds?: number
  /** 按展示优先级排列的获取规则。 */
  rules: UnlockRule[]
}

/** UnlockStrategy 是当前应用的策略快照，不作为独立列表资源管理。 */
export interface UnlockStrategy {
  /** 服务端生成的策略标识。 */
  id: string
  /** 乐观锁修订，保存时不能使用过期值。 */
  revision: number
  /** 权威 JSON 规则。 */
  document: StrategyDocument
  /** 创建时间。 */
  createdAt: string
  /** 最近修改时间。 */
  updatedAt: string
}

/** StrategyBinding 将策略绑定到小程序并保留商品映射；广告位自动使用小程序配置。 */
export interface StrategyBinding {
  /** 当前可信应用标识。 */
  applicationId: string
  /** 绑定策略，空值表示取消绑定。 */
  strategyId: string
  /** 按规则编码映射当前应用专属的平台商品。 */
  rules: Record<string, {
    /** 仅兼容历史读取；保存时忽略，不能覆盖小程序广告位配置。 */
    adUnitId?: string
    /** 本应用的平台商品标识。 */
    productId?: string
  }>
}

/** ApplicationStrategy 是当前应用的最新策略和商品配置。 */
export interface ApplicationStrategy {
  /** 与策略一致读取的应用模式；旧服务未返回时使用应用目录中的模式。 */
  monetizationMode: ApplicationMonetizationMode
  /** 当前应用内部标识，全程按字符串处理。 */
  applicationId: string
  /** 当前规则；null 表示尚未配置，保存后自动归属当前应用。 */
  strategy: UnlockStrategy | null
  /** 商品按规则编码配置，广告位使用应用资料。 */
  rules: StrategyBinding['rules']
}

/** ApplicationStrategyInput 整体保存当前应用的规则及商品映射。 */
export interface ApplicationStrategyInput {
  /** 当前应用完整的解锁规则。 */
  document: StrategyDocument
  /** 当前应用的平台商品映射，不传广告位覆盖。 */
  rules: StrategyBinding['rules']
}
