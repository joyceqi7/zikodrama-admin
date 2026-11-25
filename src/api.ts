import type { Subject, SubjectInput, SubjectOption } from './subjects'
import type { AdAnalytics, AdQuery } from './adAnalytics'
import type { RewardAnalysis, RewardReportQuery, EpisodeRewardRow, RewardTrend } from './rewardAnalysis'
import type { PublicationRecordKind, PublicationRecordPage, PublicationRecordQuery, PublicationRecordAction } from './publicationRecords'
import type { RankingCategory, RankingConfig, RankingView } from './categoryRankings'
import type { AnalyticsDashboard } from './analytics'
import type { ConsumerUserPage, ConsumerUserQuery } from './consumerUsers'
import type { TikTokPostbackLogPage, TikTokPostbackLogQuery } from './postbackLogs'
import type { CarouselConfig, CarouselTargets, CarouselView } from './homepage'
import type { ApplicationStrategy, ApplicationStrategyInput } from './domain'
import type { DramaListPage, DramaListQuery, TikTokReleaseState, TikTokReleaseInput } from './domain'
import type { Application, ApplicationCreateInput, ApplicationInput, ApplicationOption } from './applications'
import type { MiniReviewSettings, ReviewWhitelist } from './applications'
import type { AdminPermission, AdminPermissionInput, AdminRole, AdminRoleInput, AdminSession, AdminUser, AdminUserCreateInput, AdminUserUpdateInput, ApplicationMonetization, ApplicationMonetizationInput, AuditRecord, Campaign, CampaignInput, CoverAsset, DirectMediaUploadInput, Drama, DramaInput, DramaMetadataReference, DramaOperationsInput, EpisodeMediaUploadReservation, MediaJob, MediaUploadAuthorization, Overview, TikTokPublication, TikTokPublicationInput, TikTokReviewAppealInput, TikTokTag, TikTokTagSummary, } from './domain'

interface Envelope<T> {
  /** 成功为 0，失败对应 HTTP 错误状态。 */
  code: number
  /** 稳定业务错误码，供权限与身份恢复分支使用。 */
  reason?: string
  /** 服务端安全提示文案。 */
  message: string
  /** 成功结果，失败时为 null。 */
  data?: T
}

interface TokenStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status: number, code = 'request_failed') {
    super(message)
    this.status = status
    this.code = code
  }
}

import type { CampaignTarget } from './campaignTarget'

// GlobalConfig 是跨应用 JSON 配置；media 密钥由服务端返回掩码。
export interface GlobalConfig {
  // key 是配置的唯一键。
  key: string
  // value 是经过服务端脱敏的 JSON 对象。
  value: Record<string, unknown>
  // remark 说明配置用途，由运营填写。
  remark?: string
  // createdAt 是首次记录的创建时间，历史配置可能尚无记录。
  createdAt?: string
  // updatedAt 是服务端记录的最近保存时间。
  updatedAt?: string
  // updatedBy 是经服务端认证的最近操作人。
  updatedBy?: string
}

// DramaDistribution 是某部短剧在一个小程序的独立分发状态。
export interface DramaDistribution {
 // dramaId 标识共享短剧。
 dramaId: string
 // applicationId 标识目标应用。
 applicationId: string
 // ownerApplicationId 标识媒资拥有方。
 ownerApplicationId: string
 // enabled 表示运营允许分发。
 enabled: boolean
 // desiredAuthorized 表示当前是否需要平台授权。
 desiredAuthorized: boolean
 // status 是平台操作确认进度。
 status: 'pending' | 'authorized' | 'revoked' | 'failed' | 'attention_required'
 // attempts 是当前目标连续失败次数。
 attempts: number
 // errorCode 是不含敏感平台信息的错误分类。
 errorCode: string
 // nextAttemptAt 是自动重试时间。
 nextAttemptAt: string
}

// ApplicationDramaAuthorizationItem 是一部已上线短剧对当前应用的授权状态。
export interface ApplicationDramaAuthorizationItem {
  // id 是短剧内部字符串标识。
  id: string
  // title 是短剧名称。
  title: string
  // status 区分未授权、发布方、已授权、处理中和失败。
  status: 'none' | 'owner' | 'pending' | 'authorized' | 'failed' | 'attention_required'
}

// ApplicationDramaAuthorizationPage 供授权弹窗分别分页展示两栏。
export interface ApplicationDramaAuthorizationPage {
  // items 是当前页短剧。
  items: ApplicationDramaAuthorizationItem[]
  // total 是当前视图的匹配总数。
  total: number
}

// ApplicationDramaAuthorizationQuery 是按应用分页查询授权状态的条件。
export interface ApplicationDramaAuthorizationQuery {
  // page 从 1 开始。
  page: number
  // pageSize 是单页数量。
  pageSize: number
  // query 只匹配短剧标题。
  query: string
  // view 将未授权与已有授权流程分开。
  view: 'available' | 'tracked'
}

export interface OperationsApi {
 /** listApplicationOptions 读取安全应用选项，不能代替配置读取权限。 */
 listApplicationOptions(): Promise<ApplicationOption[]>
  /** getSubjectId 读取当前发布主体选择，仅用于管理端上下文。 */
  getSubjectId(): string
  /** setSubjectId 保存选中的主体 ID，不保存发布方凭据。 */
  setSubjectId(id: string): void
  /** listSubjectOptions 只读取主体 ID 和名称。 */
  listSubjectOptions(): Promise<SubjectOption[]>
  /** listSubjects 读取脱敏主体资料。 */
  listSubjects(): Promise<Subject[]>
  /** createSubject 创建发布主体，不复制现有发布方。 */
  createSubject(input: SubjectInput): Promise<Subject>
  /** updateSubject 维护资料和密钥；已有资产时身份变更由服务端拒绝。 */
  updateSubject(id: string, input: SubjectInput): Promise<Subject>

 /** 读取独立已选版本，不访问平台。 */
 findTikTokReleaseState?(id: string): Promise<TikTokReleaseState | null>
 /** 操作已选版本，不触发同步或审核。 */
 changeTikTokRelease?(id: string, input: TikTokReleaseInput): Promise<TikTokPublication>

  /** directRequest 访问已鉴权的独立运营接口，不携带外壳应用选择器。 */
  directRequest?<T>(path: string, init?: RequestInit): Promise<T>
  /** directHomepage 创建固定直连的推荐接口门面，复用现有编辑组件。 */
  directHomepage?(): OperationsApi

  /** campaignReport 查询独立链接贡献，只读且不依赖外壳默认应用。 */
  campaignReport(query: import('./campaignReport').CampaignReportQuery): Promise<import('./campaignReport').CampaignReportPage>
  /** dramaReport 查询剧目核心报表，支持所有小程序和真实分页。 */
  dramaReport(query: import('./dramaReport').DramaReportQuery): Promise<import('./dramaReport').DramaReportPage>
  /** dramaReportTrend 使用剧目报表权限读取每日贡献，人数独立去重。 */
  dramaReportTrend(dramaId: string, query: RewardReportQuery): Promise<RewardTrend>
  /** campaignReportTrend 使用链接报表权限读取每日奖励贡献。 */
  campaignReportTrend(campaignId: string, query: RewardReportQuery): Promise<RewardTrend>
  /** dramaReportEpisodes 使用独立报表权限读取广告奖励目标集明细。 */
  dramaReportEpisodes(dramaId: string, query: RewardReportQuery): Promise<EpisodeRewardRow[]>
  /** 查询当前主体的审核或上线记录。 */
  listPublicationRecords(kind: PublicationRecordKind, query: PublicationRecordQuery): Promise<PublicationRecordPage>
  /** 操作绑定指定版本；旧记录不能操作后来的任务。 */
  publicationRecordAction(kind: PublicationRecordKind, id: string, action: PublicationRecordAction, input?: TikTokReviewAppealInput | TikTokPublicationInput): Promise<TikTokPublication>

  /** rankingCategories 读取当前主体官方分类和配置数量。 */
  rankingCategories(): Promise<RankingCategory[]>
  /** categoryRanking 读取单个官方标签的完整榜单。 */
  categoryRanking(tagId: string): Promise<RankingView>
  /** saveCategoryRanking 按版本整体保存排序和展示状态，空数组清空。 */
  saveCategoryRanking(tagId: string, input: RankingConfig): Promise<RankingView>
  /** rankingTargets 只搜索当前主体已上线且属于该官方标签的短剧。 */
  rankingTargets(tagId: string, query: string, cursor: string): Promise<CarouselTargets>

  // listConsumerUsers 读取指定应用的观众分页，用户 ID 始终保留字符串。
  listConsumerUsers(query: ConsumerUserQuery, applicationId?: string): Promise<ConsumerUserPage>
  /** adAnalytics 在指定认证应用内读取独立广告统计。 */
  adAnalytics(query: AdQuery, applicationId?: string): Promise<AdAnalytics>
  // listTikTokPostbackLogs 分页读取指定应用的脱敏关键行为回传明细。
  listTikTokPostbackLogs(query: TikTokPostbackLogQuery, applicationId?: string): Promise<TikTokPostbackLogPage>
  /** getHotDramas 读取当前主体人工热播配置及并发版本。 */
  getHotDramas(): Promise<CarouselView>
  /** saveHotDramas 按版本整体替换人工热播，空数组清空且不自动补位。 */
  saveHotDramas(input: CarouselConfig): Promise<CarouselView>
  /** hotDramaTargets 搜索当前主体已上线的热播候选。 */
  hotDramaTargets(query?: string, cursor?: string): Promise<CarouselTargets>
  /** getCarousel 读取当前主体完整轮播与并发版本。 */
  getCarousel(): Promise<CarouselView>
  /** saveCarousel 按版本整体替换轮播；冲突后需重新读取。 */
  saveCarousel(input: CarouselConfig): Promise<CarouselView>
  /** carouselTargets 搜索并分页读取当前主体已上线候选剧。 */
  carouselTargets(query?: string, cursor?: string): Promise<CarouselTargets>
 // listDramaDistributions 查询独立应用分发进度。
 listDramaDistributions(id: string): Promise<DramaDistribution[]>
 // listApplicationDramaAuthorizations 读取目标应用的线上短剧及真实授权状态，不逐剧请求。
 listApplicationDramaAuthorizations(applicationId: string, query: ApplicationDramaAuthorizationQuery): Promise<ApplicationDramaAuthorizationPage>
 // setDramaDistribution 设置授权或撤权意图，也用于重试失败项。
 setDramaDistribution(id: string, applicationId: string, enabled: boolean): Promise<void>
 // authorizeApplicationDramas 在请求内授权选中的线上短剧，返回平台确认数量。
 authorizeApplicationDramas(applicationId: string, dramaIds: string[]): Promise<{ authorizedCount: number }>
  /** 读取明确应用的策略、商品映射与应用修订；未配置返回空策略。 */
  getApplicationStrategy(applicationId: string): Promise<ApplicationStrategy>
  /** 原子保存明确应用的独立策略，不改变其他应用。 */
  saveApplicationStrategy(input: ApplicationStrategyInput, applicationId: string): Promise<ApplicationStrategy>
	setApplicationId(id: string): void
	getApplicationId(): string
  // onSessionExpired 订阅统一认证失效通知。
  onSessionExpired?(listener: () => void): () => void
  // maintainSession 在到期前自动续期，过期则清除会话。
  maintainSession?(): Promise<void>
  hasSession(): boolean
  getSession(): AdminSession | null
  login(username: string, password: string): Promise<AdminSession>
  me(): Promise<AdminSession>
  logout(): Promise<void>
	listApplications(): Promise<Application[]>
	/** getReviewSettings 独立读取明确应用的审核版本和开关。 */
	getReviewSettings(applicationId: string): Promise<MiniReviewSettings>
	/** saveReviewSettings 只保存审核版本和开关，不更新应用资料或清单。 */
	saveReviewSettings(applicationId: string, input: MiniReviewSettings): Promise<MiniReviewSettings>
	/** getReviewWhitelist 读取当前主体渠道的共享审核列表。 */
	getReviewWhitelist(channel: 'official' | 'direct', subjectId: string): Promise<ReviewWhitelist>
	/** saveReviewWhitelist 仅保存首页清单，不修改应用开关或版本。 */
	saveReviewWhitelist(channel: 'official' | 'direct', subjectId: string, input: Pick<ReviewWhitelist, 'revision' | 'dramaIds'>): Promise<ReviewWhitelist>
	/** reviewWhitelistTargets 搜索当前主体指定发布渠道的上线候选。 */
	reviewWhitelistTargets(channel: 'official' | 'direct', subjectId: string, query?: string, cursor?: string): Promise<CarouselTargets>
  /** 仅凭 TikTok 应用 ID 和名称登记停用应用，授权创建后配置。 */
	createApplication(input: ApplicationCreateInput): Promise<Application>
	updateApplication(id: string, input: ApplicationInput): Promise<Application>
  /** ensureDramaCampaign 复用或生成指定小程序下的线上第一集链接，应用标识固定于点击时。 */
  ensureDramaCampaign(dramaId: string, applicationId: string): Promise<Campaign>
  listCampaigns(): Promise<Campaign[]>
  // listCampaignTargets 读取当前应用可投放的线上剧集。
  listCampaignTargets(): Promise<CampaignTarget[]>
  createCampaign(input: CampaignInput): Promise<Campaign>
  updateCampaign(id: string, input: CampaignInput): Promise<Campaign>
  overview(): Promise<Overview>
  dramaReferenceData(): Promise<DramaMetadataReference>
  // listTikTokTags 读取全局官方目录、翻译和当前主体编辑标签关联的短剧数。
  listTikTokTags(): Promise<TikTokTagSummary[]>
  // updateTikTokTag 按官方字符串 ID 覆盖英文名，空串清除；需独立更新权限。
  updateTikTokTag(id: string, englishName: string): Promise<TikTokTag>
  listDramas(input?: DramaListQuery): Promise<DramaListPage>
  findDrama(id: string): Promise<Drama>
  // createDrama 保存短剧草稿，允许空分集；返回服务端分配的短剧和分集标识。
  createDrama(input: DramaInput): Promise<Drama>
  // updateDrama 按字符串短剧 ID 保存可编辑草稿，整体替换分集清单并保留已有集的媒资；不触发视频上传。
  updateDrama(id: string, input: DramaInput): Promise<Drama>
  updateDramaOperations?(id: string, input: DramaOperationsInput): Promise<Drama>
  deleteDrama(id: string): Promise<void>
  mediaUploadAuthorization(): Promise<MediaUploadAuthorization>
  reserveEpisodeMediaUpload(id: string, file: File): Promise<EpisodeMediaUploadReservation>
  // refreshEpisodeMediaUploadAuthorization 为同一预留任务续发短期授权，供刷新后重新选择原文件继续分片上传。
  refreshEpisodeMediaUploadAuthorization(id: string, uploadId: string): Promise<MediaUploadAuthorization>
  // uploadEpisodeMediaViaServer 在浏览器 multipart 初始化失败时，将同一预留文件交由服务端官方 SDK 上传并返回处理任务。
  uploadEpisodeMediaViaServer(id: string, uploadId: string, file: File, onProgress: (progress: number) => void): Promise<MediaJob>
  reportDirectUploadDiagnostic(episodeId: string, uploadId: string, input: { stage: string, code: string, status: number, reason: string }): Promise<void>
  uploadCover(file: File, onProgress: (progress: number) => void): Promise<CoverAsset>
  queueDirectEpisodeMedia(id: string, input: DirectMediaUploadInput): Promise<MediaJob>
  // findMediaJob 读取指定上传任务的权威状态，供旧预留冲突时判断是否可以重新上传。
  findMediaJob(id: string): Promise<MediaJob>
  listDramaMediaJobs(id: string): Promise<MediaJob[]>
  retryMediaJob(id: string): Promise<MediaJob>
  /** prepareDrama 确认已保存内容就绪，不生成版本。 */
  prepareDrama(id: string): Promise<Drama>
  /** prepareDramas 整批确认已保存的内容就绪，任一未就绪时整批不变。 */
  prepareDramas(ids: string[]): Promise<{ readyCount: number }>
  // submitTikTokPublication 冻结内容并同步调用官方接口，不自动送审或上线；媒体结果可以尚在处理中。
  submitTikTokPublication(id: string, input?: { transcode: boolean }): Promise<TikTokPublication>
  // submitTikTokReview 将已同步的剧目版本提交 TikTok 审核。
  submitTikTokReview(id: string, input: TikTokPublicationInput): Promise<TikTokPublication>
  // findTikTokPublication 查询短剧当前的官方发布进度。
  findTikTokPublication(id: string): Promise<TikTokPublication>
  // refreshTikTokReview 手动查询一次当前冻结版本的审核事实，通过后停留待上线。
  refreshTikTokReview(id: string): Promise<TikTokPublication>
  // publishTikTokPublication 在本次请求内选择并上线用户确认的已审核版本；过期页面不能操作新版本。
  publishTikTokPublication(id: string, publicationId: string): Promise<TikTokPublication>
  // appealTikTokReview 提交当前被拒对象的申诉。
  appealTikTokReview?(id: string, input: TikTokReviewAppealInput): Promise<TikTokPublication>
  // withdrawTikTokReview 在请求内撤回当前审核版本。
  withdrawTikTokReview?(id: string): Promise<TikTokPublication>
  // retryTikTokPublication 人工恢复失败阶段；未知 Album 更新先核对，原版本未推进时由版本保护恢复冻结内容，首次同步仍只查询。
  retryTikTokPublication(id: string, input?: TikTokPublicationInput): Promise<TikTokPublication>
  // unpublishDrama 在本次请求内下架已选的 TikTok 版本。
  unpublishDrama(id: string): Promise<TikTokPublication>
  getApplicationMonetization(): Promise<ApplicationMonetization>
  updateApplicationMonetization(input: ApplicationMonetizationInput): Promise<ApplicationMonetization>
  /** rewardAnalysis 查询所有或单个小程序的奖励贡献排行。 */
  rewardAnalysis(query: RewardReportQuery): Promise<RewardAnalysis>
  /** rewardEpisodes 查询共享剧的奖励目标集明细。 */
  rewardEpisodes(dramaId: string, query: RewardReportQuery): Promise<EpisodeRewardRow[]>
  /** rewardTrend 查询指定剧或链接的日期趋势与范围去重人数。 */
  rewardTrend(dimension: 'drama' | 'campaign', targetId: string, query: RewardReportQuery): Promise<RewardTrend>
  // dashboard 查询当前应用闭区间日期内的仪表盘账本统计。
  dashboard(from: string, to: string, rankingRange?: 'range' | 'all'): Promise<AnalyticsDashboard>
  auditLogs(limit?: number): Promise<AuditRecord[]>
  listUsers(): Promise<AdminUser[]>
  createUser(input: AdminUserCreateInput): Promise<AdminUser>
  updateUser(id: string, input: AdminUserUpdateInput): Promise<AdminUser>
  resetUserPassword(id: string, password: string): Promise<void>
  setUserRoles(id: string, roleIds: string[]): Promise<void>
  listRoles(): Promise<AdminRole[]>
  createRole(input: AdminRoleInput): Promise<AdminRole>
  updateRole(id: string, input: AdminRoleInput): Promise<AdminRole>
  deleteRole(id: string): Promise<void>
  setRolePermissions(id: string, permissionIds: string[]): Promise<void>
  // listPermissions 读取包含父节点和状态的完整权限树资料。
  listPermissions(): Promise<AdminPermission[]>
  // createPermission 新增目录、菜单或操作节点。
  createPermission(input: AdminPermissionInput): Promise<AdminPermission>
  // updatePermission 编辑或移动节点，服务端拒绝环和无效层级。
  updatePermission(id: string, input: AdminPermissionInput): Promise<AdminPermission>
  // deletePermission 删除未被子节点或角色引用的权限。
  deletePermission(id: string): Promise<void>
  // listGlobalConfigs 返回跨应用配置的脱敏列表。
  listGlobalConfigs(): Promise<GlobalConfig[]>
  // saveGlobalConfig 保存 JSON；media 中未替换的密钥掩码由服务端保留。
  saveGlobalConfig(key: string, value: Record<string, unknown>, remark?: string): Promise<GlobalConfig>
  // deleteGlobalConfig 删除非 media 配置。
  deleteGlobalConfig(key: string): Promise<void>
}

const legacyStorageKeys = {
  token: 'drama_admin_token',
  session: 'drama_admin_session',
  mediaUploadPrefix: 'drama_media_upload:',
  application: 'drama_admin_application',
}

type StorageKeys = typeof legacyStorageKeys

function storageKeys(namespace: string): StorageKeys {
  if (!namespace) return legacyStorageKeys
  const prefix = `drama_admin:${namespace}:`
  return {
    token: `${prefix}token`,
    session: `${prefix}session`,
    mediaUploadPrefix: `${prefix}media_upload:`,
    application: `${prefix}application`,
  }
}

export class HttpOperationsApi implements OperationsApi {
  /** 查询共享业务记录，不携带应用隔离参数。 */
  listPublicationRecords(kind: PublicationRecordKind, query: PublicationRecordQuery): Promise<PublicationRecordPage> {
    const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) })
    if (query.dramaId) params.set('dramaId', query.dramaId)
    if (query.status) params.set('status', query.status)
    return this.request(`/admin/v1/publication-records/${kind}?${params}`)
  }
  /** 服务端再次校验版本及状态，并复用官方流程。 */
  publicationRecordAction(kind: PublicationRecordKind, id: string, action: PublicationRecordAction, input?: TikTokReviewAppealInput | TikTokPublicationInput): Promise<TikTokPublication> {
    return this.request(`/admin/v1/publication-records/${kind}/${encodeURIComponent(id)}/${action}`, { method: 'POST', ...(input ? { body: JSON.stringify(input) } : {}) })
  }

  private readonly expirationListeners = new Set<() => void>()
  private renewal: Promise<void> | null = null
  // sessionEpoch 让迟到的 me/login 响应不能覆盖退出或后续登录后的账号。
  private sessionEpoch = 0
  private token: string
  private session: AdminSession | null
  private readonly baseUrl: string
  private readonly fetcher: typeof fetch
  private readonly storage: TokenStorage
  private readonly storageKeys: StorageKeys
  private applicationId: string
  private subjectId: string

  constructor(baseUrl: string, fetcher: typeof fetch = fetch, storage: TokenStorage = sessionStorage, storageNamespace = '') {
    this.baseUrl = baseUrl
    this.fetcher = (input, init) => fetcher(input, init)
    this.storage = storage
    this.storageKeys = storageKeys(storageNamespace)
    this.token = storage.getItem(this.storageKeys.token) ?? ''
    this.session = parseSession(storage.getItem(this.storageKeys.session))
    this.applicationId = storage.getItem(this.storageKeys.application) ?? ''
    this.subjectId = storage.getItem(this.storageKeys.application + ':subject') ?? ''
  }

  /** getSubjectId 返回当前主体选择。 */
  getSubjectId(): string { return this.subjectId }
  /** setSubjectId 只持久化选择 ID；各业务页面必须在切换后作废旧查询。 */
  setSubjectId(id: string): void {
    this.subjectId = id
    if (id) this.storage.setItem(this.storageKeys.application + ':subject', id)
    else this.storage.removeItem(this.storageKeys.application + ':subject')
  }
  /** listApplicationOptions 只返回应用选择字段。 */
  listApplicationOptions():Promise<ApplicationOption[]> { return this.request('/admin/v1/applications/options') }
  /** listSubjectOptions 不返回任何发布方配置。 */
  listSubjectOptions(): Promise<SubjectOption[]> { return this.request('/admin/v1/subjects/options') }
  /** listSubjects 读取主体管理目录。 */
  listSubjects(): Promise<Subject[]> { return this.request('/admin/v1/subjects') }
  /** createSubject 提交本次输入，密钥不进入浏览器存储。 */
  createSubject(input: SubjectInput): Promise<Subject> { return this.request('/admin/v1/subjects', {method:'POST',body:JSON.stringify(input)}) }
  /** updateSubject 空密钥保留服务器当前值。 */
  updateSubject(id: string, input: SubjectInput): Promise<Subject> { return this.request(`/admin/v1/subjects/${encodeURIComponent(id)}`, {method:'PUT',body:JSON.stringify(input)}) }

  setApplicationId(id: string): void {
    this.applicationId = id
    if (id) this.storage.setItem(this.storageKeys.application, id)
    else this.storage.removeItem(this.storageKeys.application)
  }

	getApplicationId(): string {
		return this.applicationId
	}

  hasSession(): boolean {
    return this.token !== ''
  }

  getSession(): AdminSession | null {
    return this.session
  }

  // onSessionExpired 将任意请求的认证失效同步给登录界面。
  onSessionExpired(listener: () => void): () => void {
    this.expirationListeners.add(listener)
    return () => { this.expirationListeners.delete(listener) }
  }

  private clearSession(): void {
    this.sessionEpoch += 1
    this.token = ''
    this.session = null
    this.storage.removeItem(this.storageKeys.token)
    this.storage.removeItem(this.storageKeys.session)
  }

  private expireSession(token: string): void {
    // 旧请求不能清除续期或重新登录后获得的新凭据。
    if (!token || token !== this.token) return
    this.clearSession()
    console.warn('管理员登录已失效', { status: 401 })
    this.expirationListeners.forEach((listener) => listener())
  }

  // maintainSession 合并并发续期；网络故障保留现有会话，认证失败才回到登录页。
  async maintainSession(): Promise<void> {
    const token = this.token
    if (!token) return
    let expiresAt: number
    try {
      expiresAt = Number(JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp) * 1000
    } catch {
      // 无法解析的旧凭据交由服务端验证，不能根据客户端解码授予权限。
      return
    }
    if (!Number.isFinite(expiresAt)) return
    if (expiresAt <= Date.now()) {
      this.expireSession(token)
      throw new ApiError('登录已失效，请重新登录', 401, 'operations_unauthorized')
    }
    if (expiresAt - Date.now() > 5 * 60 * 1000) return
    if (!this.renewal) {
      this.renewal = this.request<{ token: string } & AdminSession>('/admin/v1/session/refresh', { method: 'POST' })
        .then((result) => {
          if (this.token !== token) return
          this.token = result.token
          this.storage.setItem(this.storageKeys.token, result.token)
          this.rememberSession(result)
        })
        .finally(() => { this.renewal = null })
    }
    await this.renewal
  }

  async login(username: string, password: string): Promise<AdminSession> {
    const epoch = this.sessionEpoch
    const result = await this.request<{ token: string } & AdminSession>(
      '/admin/v1/session',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      },
      false,
    )
    if (epoch !== this.sessionEpoch) throw new ApiError('登录状态已变化，请重新操作', 409, 'session_changed')
    this.sessionEpoch += 1
    this.token = result.token
    this.storage.setItem(this.storageKeys.token, result.token)
    return this.rememberSession(result)
  }

  async me(): Promise<AdminSession> {
    const epoch = this.sessionEpoch
    const result = await this.request<AdminSession>('/admin/v1/me')
    if (epoch !== this.sessionEpoch) throw new ApiError('登录状态已变化，请重新操作', 409, 'session_changed')
    return this.rememberSession(result)
  }

  async logout(): Promise<void> {
    const token = this.token
    // 先清除本地凭据，避免尚未完成的续期响应恢复已退出的会话。
    this.clearSession()
    try {
      if (token) {
        const response = await this.fetcher(this.url('/admin/v1/session'), {
          method: 'DELETE', headers: { authorization: `Bearer ${token}` },
        })
        if (!response.ok) console.warn('管理员退出请求失败', { status: response.status })
      }
    } catch {
      console.warn('管理员退出请求失败', { code: 'network_error' })
    }
  }

	listApplications(): Promise<Application[]> {
		return this.request('/admin/v1/applications')
	}

	/** getReviewSettings 在发送前固定应用范围。 */
	getReviewSettings(applicationId: string): Promise<MiniReviewSettings> {
		return this.applicationRequest('/admin/v1/review-settings', {}, applicationId)
	}
	/** saveReviewSettings 只提交该应用的版本、开关及并发修订。 */
	saveReviewSettings(applicationId: string, input: MiniReviewSettings): Promise<MiniReviewSettings> {
		return this.applicationRequest('/admin/v1/review-settings', {method:'PUT', body:JSON.stringify(input)}, applicationId)
	}
	/** getReviewWhitelist 固定主体和发布渠道，应用选择器不改变审核列表范围。 */
	getReviewWhitelist(channel: 'official' | 'direct', subjectId: string): Promise<ReviewWhitelist> {
		return this.subjectRequest(`/admin/v1/${channel}/review-list`, {}, subjectId)
	}
	/** saveReviewWhitelist 按修订提交独立白名单。 */
	saveReviewWhitelist(channel: 'official' | 'direct', subjectId: string, input: Pick<ReviewWhitelist, 'revision' | 'dramaIds'>): Promise<ReviewWhitelist> {
		return this.subjectRequest(`/admin/v1/${channel}/review-list`, {method:'PUT', body:JSON.stringify(input)}, subjectId)
	}
	/** reviewWhitelistTargets 仅返回当前主体渠道已上线的短剧。 */
	reviewWhitelistTargets(channel: 'official' | 'direct', subjectId: string, query = '', cursor = ''): Promise<CarouselTargets> {
		return this.subjectRequest(`/admin/v1/${channel}/review-list/targets?${new URLSearchParams({query,cursor})}`, {}, subjectId)
	}

  /** 创建停用应用，由服务端生成内部业务编码。 */
	createApplication(input: ApplicationCreateInput): Promise<Application> {
		return this.request('/admin/v1/applications', { method: 'POST', body: JSON.stringify(input) })
	}

	updateApplication(id: string, input: ApplicationInput): Promise<Application> {
		return this.request(`/admin/v1/applications/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) })
	}

  /** ensureDramaCampaign 由服务端校验线上目标并持久化官方链接，不接受客户端指定集数。 */
  ensureDramaCampaign(dramaId: string, applicationId: string): Promise<Campaign> {
    return this.applicationRequest(`/admin/v1/dramas/${encodeURIComponent(dramaId)}/campaign-link`, { method: 'POST' }, applicationId)
  }

  listCampaigns(): Promise<Campaign[]> {
    return this.applicationRequest('/admin/v1/campaigns')
  }

  // listCampaignTargets 不读取编辑中的内容目录。
  listCampaignTargets(): Promise<CampaignTarget[]> {
    return this.applicationRequest('/admin/v1/campaign-targets')
  }

  createCampaign(input: CampaignInput): Promise<Campaign> {
    return this.applicationRequest('/admin/v1/campaigns', { method: 'POST', body: JSON.stringify(input) })
  }

  updateCampaign(id: string, input: CampaignInput): Promise<Campaign> {
    return this.applicationRequest(`/admin/v1/campaigns/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) })
  }

  overview(): Promise<Overview> {
    return this.request('/admin/v1/overview')
  }

  dramaReferenceData(): Promise<DramaMetadataReference> {
    return this.request('/admin/v1/drama-reference-data')
  }

  // updateTikTokTag 仅提交英文名，不传官方身份资料。
  updateTikTokTag(id: string, englishName: string): Promise<TikTokTag> {
    return this.request(`/admin/v1/tiktok-tags/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ englishName }) })
  }

  // listTikTokTags 读取全局官方目录、翻译和当前主体编辑标签关联的短剧数。
  listTikTokTags(): Promise<TikTokTagSummary[]> {
    return this.request('/admin/v1/tiktok-tags')
  }

  // listDramas 在 HTTP 边界把合法的空标签统一为数组，页面不承担传输格式差异。
  async listDramas(input?: DramaListQuery): Promise<DramaListPage> {
    const query = new URLSearchParams({ page: String(input?.page ?? 1), pageSize: String(input?.pageSize ?? 20) })
    if (input?.query) query.set('query', input.query)
    if (input?.publication) query.set('publication', input.publication)
    if (input?.contentStatus) query.set('contentStatus', input.contentStatus)
    if (input?.directStatus) query.set('directStatus', input.directStatus)
    const page = await this.request<DramaListPage>(`/admin/v1/dramas?${query}`)
    return { ...page, items: page.items.map((item) => ({ ...item, tags: item.tags ?? [] })) }
  }

  // findDrama 与目录使用相同的空标签语义。
  async findDrama(id: string): Promise<Drama> {
    return normalizeDrama(await this.request<Drama>(`/admin/v1/dramas/${encodeURIComponent(id)}`))
  }

  // createDrama 规范保存响应，避免新建零标签剧目后本地目录再次出现 null。
  async createDrama(input: DramaInput): Promise<Drama> {
    return normalizeDrama(await this.request<Drama>('/admin/v1/dramas', { method: 'POST', body: JSON.stringify(input) }))
  }

  // updateDrama 与其他短剧读取入口保持相同的数据约定。
  async updateDrama(id: string, input: DramaInput): Promise<Drama> {
    return normalizeDrama(await this.request<Drama>(`/admin/v1/dramas/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }))
  }

  async updateDramaOperations(id: string, input: DramaOperationsInput): Promise<Drama> {
    return normalizeDrama(await this.request<Drama>(`/admin/v1/dramas/${encodeURIComponent(id)}/operations`, {
      method: 'PUT', body: JSON.stringify(input),
    }))
  }

  async deleteDrama(id: string): Promise<void> {
    await this.request(`/admin/v1/dramas/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  mediaUploadAuthorization(): Promise<MediaUploadAuthorization> {
    return this.request('/admin/v1/media-uploads/authorization', { method: 'POST', body: '{}' })
  }

  reserveEpisodeMediaUpload(id: string, file: File): Promise<EpisodeMediaUploadReservation> {
    return this.request(`/admin/v1/episodes/${encodeURIComponent(id)}/media-uploads`, {
      method: 'POST',
      body: JSON.stringify({ fileName: file.name, size: file.size }),
    })
  }

  refreshEpisodeMediaUploadAuthorization(id: string, uploadId: string): Promise<MediaUploadAuthorization> {
    return this.request(`/admin/v1/episodes/${encodeURIComponent(id)}/media-uploads/${encodeURIComponent(uploadId)}/authorization`, {
      method: 'POST',
      body: '{}',
    })
  }

  async uploadEpisodeMediaViaServer(id: string, uploadId: string, file: File, onProgress: (progress: number) => void): Promise<MediaJob> {
    // 在续签前固定主体，等待期间切换选择也不能把文件提交到另一主体。
    const subjectId = this.subjectId
    await this.maintainSession()
    const token = this.token
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest()
      request.open('POST', this.url(`/admin/v1/episodes/${encodeURIComponent(id)}/media-uploads/${encodeURIComponent(uploadId)}/proxy`))
      request.setRequestHeader('authorization', `Bearer ${token}`)
      if (subjectId) request.setRequestHeader('x-subject-id', subjectId)
      request.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
      })
      request.addEventListener('load', () => {
        if (request.status === 401) this.expireSession(token)
        try {
          const payload = JSON.parse(request.responseText) as Envelope<MediaJob>
          if (request.status < 200 || request.status >= 300 || payload.code > 0 || !payload.data) {
            reject(new ApiError(payload.message ?? '视频上传失败', request.status, payload.reason))
            return
          }
          onProgress(100)
          resolve(payload.data)
        } catch {
          reject(new ApiError('视频上传响应无效', request.status, 'invalid_response'))
        }
      })
      request.addEventListener('error', () => reject(new ApiError('网络连接失败', 0, 'network_error')))
      const body = new FormData()
      body.append('file', file)
      request.send(body)
    })
  }

  async reportDirectUploadDiagnostic(episodeId: string, uploadId: string, input: { stage: string, code: string, status: number, reason: string }): Promise<void> {
    await this.request(`/admin/v1/episodes/${encodeURIComponent(episodeId)}/media-uploads/${encodeURIComponent(uploadId)}/diagnostics`, {
      method: 'POST', body: JSON.stringify(input),
    })
  }

  async uploadCover(file: File, onProgress: (progress: number) => void): Promise<CoverAsset> {
    // 在续签前固定主体，等待期间切换选择也不能把文件提交到另一主体。
    const subjectId = this.subjectId
    await this.maintainSession()
    const token = this.token
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest()
      request.open('POST', this.url('/admin/v1/covers'))
      request.setRequestHeader('authorization', `Bearer ${token}`)
      if (subjectId) request.setRequestHeader('x-subject-id', subjectId)
      request.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
      })
      request.addEventListener('load', () => {
        if (request.status === 401) this.expireSession(token)
        try {
          const payload = JSON.parse(request.responseText) as Envelope<CoverAsset>
          if (request.status < 200 || request.status >= 300 || payload.code > 0 || !payload.data) {
            reject(new ApiError(payload.message ?? '封面上传失败', request.status, payload.reason))
            return
          }
          onProgress(100)
          resolve(payload.data)
        } catch {
          reject(new ApiError('封面上传响应无效', request.status, 'invalid_response'))
        }
      })
      request.addEventListener('error', () => reject(new ApiError('网络连接失败', 0, 'network_error')))
      const body = new FormData()
      body.append('file', file)
      request.send(body)
    })
  }

  async queueDirectEpisodeMedia(id: string, input: DirectMediaUploadInput): Promise<MediaJob> {
    const storageKey = directMediaUploadStorageKey(this.storageKeys.mediaUploadPrefix, id, input)
    const idempotencyKey = this.storage.getItem(storageKey) ?? createMediaIdempotencyKey()
    this.storage.setItem(storageKey, idempotencyKey)
    try {
      const job = await this.request<MediaJob>(`/admin/v1/episodes/${encodeURIComponent(id)}/media/direct`, {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey },
        body: JSON.stringify(input),
      })
      this.storage.removeItem(storageKey)
      return job
    } catch (error) {
      if (error instanceof ApiError && error.code === 'media_upload_discarded') this.storage.removeItem(storageKey)
      throw error
    }
  }

  listDramaMediaJobs(id: string): Promise<MediaJob[]> {
    return this.request(`/admin/v1/dramas/${encodeURIComponent(id)}/media-jobs`)
  }

  // findMediaJob 只读取服务端已登记任务，不改变媒资或分集状态。
  findMediaJob(id: string): Promise<MediaJob> {
    return this.request(`/admin/v1/media-jobs/${encodeURIComponent(id)}`)
  }

  retryMediaJob(id: string): Promise<MediaJob> {
    return this.request(`/admin/v1/media-jobs/${encodeURIComponent(id)}/retry`, {
      method: 'POST',
      body: '{}',
    })
  }

  /** prepareDrama 校验当前草稿并确认就绪，不生成版本。 */
  prepareDrama(id: string): Promise<Drama> {
    return this.request(`/admin/v1/dramas/${encodeURIComponent(id)}/ready`, { method: 'POST', body: '{}' })
  }
  /** prepareDramas 在一次事务确认整批内容，不创建任何渠道任务或版本。 */
  prepareDramas(ids: string[]): Promise<{ readyCount: number }> {
    return this.request('/admin/v1/dramas/ready', { method: 'POST', body: JSON.stringify({ dramaIds: ids }) })
  }
  // submitTikTokPublication 冻结已保存内容；显式转码选择不改变旧客户端的默认行为。
  submitTikTokPublication(id: string, input?: { transcode: boolean }): Promise<TikTokPublication> {
    return this.request(`/admin/v1/dramas/${encodeURIComponent(id)}/publications`, {
      method: 'POST',
      body: JSON.stringify(input || {}),
    })
  }

  // submitTikTokReview 只提交已同步版本审核，优先级不参与同步任务。
  submitTikTokReview(id: string, input: TikTokPublicationInput): Promise<TikTokPublication> {
    return this.request(`/admin/v1/dramas/${encodeURIComponent(id)}/publication/submit-review`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  // findTikTokPublication 只读取本地保存的发布进度，不访问平台审核接口。
  findTikTokPublication(id: string): Promise<TikTokPublication> {
    return this.request(`/admin/v1/dramas/${encodeURIComponent(id)}/publication`)
  }

  // refreshTikTokReview 请求服务端查询并保存一次官方审核结果。
  refreshTikTokReview(id: string): Promise<TikTokPublication> {
    return this.request(`/admin/v1/dramas/${encodeURIComponent(id)}/publication/refresh-review`, { method: 'POST' })
  }

  // publishTikTokPublication 在请求内上线明确确认的已审核版本，响应表示平台已确认。
  publishTikTokPublication(id: string, publicationId: string): Promise<TikTokPublication> {
    return this.request(`/admin/v1/dramas/${encodeURIComponent(id)}/publications/${encodeURIComponent(publicationId)}/publish`, { method: 'POST' })
  }

  // appealTikTokReview 由服务端 Worker 调用官方申诉接口。
  appealTikTokReview(id: string, input: TikTokReviewAppealInput): Promise<TikTokPublication> {
    return this.request(`/admin/v1/dramas/${encodeURIComponent(id)}/publication/appeal`, { method: 'POST', body: JSON.stringify(input) })
  }

  // withdrawTikTokReview 不从浏览器传入可篡改的平台版本。
  withdrawTikTokReview(id: string): Promise<TikTokPublication> {
    return this.request(`/admin/v1/dramas/${encodeURIComponent(id)}/publication/withdraw`, { method: 'POST' })
  }

  /** retryTikTokPublication 不接受客户端指定平台版本，由服务端核对冻结记录并保护恢复写入。 */
  retryTikTokPublication(id: string, input?: TikTokPublicationInput): Promise<TikTokPublication> {
    return this.request(`/admin/v1/dramas/${encodeURIComponent(id)}/publication/retry`, {
      method: 'POST',
      body: JSON.stringify(input ?? {}),
    })
  }

  /** findTikTokReleaseState 只读取本地确认的官方版本及上下架进度。 */
  findTikTokReleaseState(id: string): Promise<TikTokReleaseState | null> {
    return this.request(`/admin/v1/dramas/${encodeURIComponent(id)}/official-release`)
  }
  /** changeTikTokRelease 固定目标记录，避免最新审核任务偷换当前版本。 */
  changeTikTokRelease(id: string, input: TikTokReleaseInput): Promise<TikTokPublication> {
    return this.request(`/admin/v1/dramas/${encodeURIComponent(id)}/official-release`, { method: 'POST', body: JSON.stringify(input) })
  }

  unpublishDrama(id: string): Promise<TikTokPublication> {
    return this.request(`/admin/v1/dramas/${encodeURIComponent(id)}/unpublish`, {
      method: 'POST',
      body: '{}',
    })
  }

  /** 读取指定应用的独立策略配置。 */
  getApplicationStrategy(applicationId: string): Promise<ApplicationStrategy> { return this.applicationRequest('/admin/v1/application-strategy', {}, applicationId) }
  /** 使用应用修订原子保存规则及商品，不使用外壳可能已变化的默认应用。 */
  saveApplicationStrategy(input: ApplicationStrategyInput, applicationId: string): Promise<ApplicationStrategy> { return this.applicationRequest('/admin/v1/application-strategy', { method: 'PUT', body: JSON.stringify(input) }, applicationId) }

  getApplicationMonetization(): Promise<ApplicationMonetization> {
    return this.applicationRequest('/admin/v1/application-monetization')
  }

  updateApplicationMonetization(input: ApplicationMonetizationInput): Promise<ApplicationMonetization> {
    return this.applicationRequest('/admin/v1/application-monetization', { method: 'PUT', body: JSON.stringify(input) })
  }

  /** listConsumerUsers 按显式应用上下文读取观众分页。 */
  listConsumerUsers(query: ConsumerUserQuery, applicationId = this.applicationId): Promise<ConsumerUserPage> {
    const params = new URLSearchParams({ pageSize: String(query.pageSize) })
    if (query.cursor) params.set('cursor', query.cursor)
    if (query.userId?.trim()) params.set('userId', query.userId.trim())
    return this.applicationRequest(`/admin/v1/consumer-users?${params}`, {}, applicationId)
  }

  /** listTikTokPostbackLogs 按显式应用、事件和结果筛选回传日志。 */
  listTikTokPostbackLogs(query: TikTokPostbackLogQuery, applicationId = this.applicationId): Promise<TikTokPostbackLogPage> {
    const params = new URLSearchParams({ pageSize: String(query.pageSize) })
    if (query.cursor) params.set('cursor', query.cursor)
    if (query.event) params.set('event', query.event)
    if (query.outcome) params.set('outcome', query.outcome)
    for (const key of ['scene', 'clientVersion', 'errorCode', 'from', 'to'] as const) if (query[key]) params.set(key, query[key])
    return this.applicationRequest(`/admin/v1/tiktok-postback-logs?${params}`, {}, applicationId)
  }

  /** adAnalytics 只提交有限筛选维度，使用原应用隔离和错误处理。 */
  adAnalytics(query: AdQuery, applicationId = this.applicationId): Promise<AdAnalytics> {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value))
    return this.applicationRequest(`/admin/v1/ad-analytics?${params}`, {}, applicationId)
  }

  /** directRequest 复用统一鉴权与错误处理，并固定本次请求的主体。 */
  directRequest<T>(path: string, init: RequestInit = {}): Promise<T> {return this.request(path,init)}
  /** directHomepage 返回当前主体的直连渠道门面，所有调用保持同一会话。 */
  directHomepage(): OperationsApi {
    const prefix='/admin/v1/direct';
    const methods: Partial<OperationsApi>={
      getCarousel:()=>this.request(`${prefix}/carousel`),
      saveCarousel:input=>this.request(`${prefix}/carousel`,{method:'PUT',body:JSON.stringify(input)}),
      carouselTargets:(query='',cursor='')=>this.request(`${prefix}/carousel/targets?${new URLSearchParams({query,cursor})}`),
      getHotDramas:()=>this.request(`${prefix}/hot-dramas`),
      saveHotDramas:input=>this.request(`${prefix}/hot-dramas`,{method:'PUT',body:JSON.stringify(input)}),
      hotDramaTargets:(query='',cursor='')=>this.request(`${prefix}/hot-dramas/targets?${new URLSearchParams({query,cursor})}`),
      rankingCategories:()=>this.request(`${prefix}/category-rankings`),
      categoryRanking:id=>this.request(`${prefix}/category-rankings/${encodeURIComponent(id)}`),
      saveCategoryRanking:(id,input)=>this.request(`${prefix}/category-rankings/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(input)}),
      rankingTargets:(id,query,cursor)=>this.request(`${prefix}/category-rankings/${encodeURIComponent(id)}/targets?${new URLSearchParams({query,cursor})}`),
    };
    return new Proxy(this,{get(target,key){const override=methods[key as keyof OperationsApi];if(override)return override;const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value}});
  }

  /** rankingCategories 获取全局全部官方分类。 */
  rankingCategories(): Promise<RankingCategory[]> { return this.request('/admin/v1/category-rankings') }
  /** categoryRanking 读取指定分类的版本和完整有序引用。 */
  categoryRanking(tagId: string): Promise<RankingView> { return this.request(`/admin/v1/category-rankings/${encodeURIComponent(tagId)}`) }
  /** saveCategoryRanking 原子替换全局分类榜单。 */
  saveCategoryRanking(tagId: string, input: RankingConfig): Promise<RankingView> { return this.request(`/admin/v1/category-rankings/${encodeURIComponent(tagId)}`, { method: 'PUT', body: JSON.stringify(input) }) }
  /** rankingTargets 按官方标签字符串 ID 搜索候选，避免同名翻译串榜。 */
  rankingTargets(tagId: string, query: string, cursor: string): Promise<CarouselTargets> { return this.request(`/admin/v1/category-rankings/${encodeURIComponent(tagId)}/targets?${new URLSearchParams({ query, cursor })}`) }

  /** getHotDramas 读取当前主体人工热播。 */
  getHotDramas(): Promise<CarouselView> { return this.request('/admin/v1/hot-dramas') }
  /** saveHotDramas 保存顺序、标题与展示状态，服务端执行并发校验。 */
  saveHotDramas(input: CarouselConfig): Promise<CarouselView> { return this.request('/admin/v1/hot-dramas', { method: 'PUT', body: JSON.stringify(input) }) }
  /** hotDramaTargets 分页检索全部已上线短剧。 */
  hotDramaTargets(query = '', cursor = ''): Promise<CarouselTargets> {
    const params = new URLSearchParams({ query, cursor })
    return this.request(`/admin/v1/hot-dramas/targets?${params}`, {})
  }
  /** getCarousel 读取当前主体官方通道的轮播配置。 */
  getCarousel(): Promise<CarouselView> { return this.request('/admin/v1/carousel') }
  /** saveCarousel 只传剧目引用和并发版本，封面由服务端读取线上资料。 */
  saveCarousel(input: CarouselConfig): Promise<CarouselView> { return this.request('/admin/v1/carousel', { method: 'PUT', body: JSON.stringify(input) }) }
  /** carouselTargets 返回真实可见目录的搜索分页。 */
  carouselTargets(query = '', cursor = ''): Promise<CarouselTargets> {
    const params = new URLSearchParams({ query, cursor })
    return this.request(`/admin/v1/carousel/targets?${params}`, {})
  }

  /** rewardAnalysis 不依赖外壳选中应用，空标识明确查询所有小程序。 */
  rewardAnalysis(query: RewardReportQuery): Promise<RewardAnalysis> {
    return this.rewardReportRequest('/admin/v1/reward-analysis', query)
  }
  /** rewardEpisodes 保持分集与排行一致的应用及历史范围。 */
  rewardEpisodes(dramaId: string, query: RewardReportQuery): Promise<EpisodeRewardRow[]> {
    return this.rewardReportRequest(`/admin/v1/reward-analysis/dramas/${encodeURIComponent(dramaId)}/episodes`, query)
  }
  /** rewardTrend 忽略排行历史开关，只使用所选日期。 */
  rewardTrend(dimension: 'drama' | 'campaign', targetId: string, query: RewardReportQuery): Promise<RewardTrend> {
    return this.rewardReportRequest('/admin/v1/reward-analysis/trend', { ...query, range: 'range' }, { dimension, targetId })
  }
  private rewardReportRequest<T>(path: string, query: RewardReportQuery, extra: Record<string, string> = {}): Promise<T> {
    const params = new URLSearchParams({ from: query.from, to: query.to, range: query.range, scope: query.applicationId ? 'application' : 'all', ...extra })
    // 报表的全部/单应用都固定在当前主体；在续签之前捕获，不能只让单应用头覆盖主体选择。
    const headers = this.subjectId ? { 'x-subject-id': this.subjectId } : undefined
    return this.request(`${path}?${params}`, { headers }, true, query.applicationId ? 'application' : 'global', query.applicationId)
  }
  /** campaignReport 显式传递所有或单应用范围，分页与排序由服务端执行。 */
  campaignReport(query: import('./campaignReport').CampaignReportQuery): Promise<import('./campaignReport').CampaignReportPage> {
    return this.rewardReportRequest('/admin/v1/campaign-report', { ...query, range: 'range' }, { query: query.query, page: String(query.page), pageSize: String(query.pageSize), sort: query.sort, direction: query.direction })
  }
  /** dramaReport 明确发送应用范围，不沿用外壳的应用默认值。 */
  dramaReport(query: import('./dramaReport').DramaReportQuery): Promise<import('./dramaReport').DramaReportPage> {
    return this.rewardReportRequest('/admin/v1/drama-report', { ...query, range: 'range' }, { query: query.query, page: String(query.page), pageSize: String(query.pageSize), sort: query.sort, direction: query.direction })
  }
  /** dramaReportTrend 沿用剧目报表的应用和日期范围。 */
  dramaReportTrend(dramaId: string, query: RewardReportQuery): Promise<RewardTrend> {
    return this.rewardReportRequest(`/admin/v1/drama-report/${encodeURIComponent(dramaId)}/trend`, { ...query, range: 'range' })
  }
  /** campaignReportTrend 沿用链接报表的应用和日期范围。 */
  campaignReportTrend(campaignId: string, query: RewardReportQuery): Promise<RewardTrend> {
    return this.rewardReportRequest(`/admin/v1/campaign-report/${encodeURIComponent(campaignId)}/trend`, { ...query, range: 'range' })
  }
  /** dramaReportEpisodes 保持与列表一致的日期和应用范围。 */
  dramaReportEpisodes(dramaId: string, query: RewardReportQuery): Promise<EpisodeRewardRow[]> {
    return this.rewardReportRequest(`/admin/v1/drama-report/${encodeURIComponent(dramaId)}/episodes`, { ...query, range: 'range' })
  }
  // dashboard 通过应用上下文查询仪表盘，日期以 UTC 解释。
  dashboard(from: string, to: string, rankingRange?: 'range' | 'all'): Promise<AnalyticsDashboard> {
    return this.applicationRequest(`/admin/v1/dashboard?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${rankingRange ? `&rankingRange=${rankingRange}` : ''}`)
  }

  auditLogs(limit = 100): Promise<AuditRecord[]> {
    return this.request(`/admin/v1/audit-logs?limit=${encodeURIComponent(String(limit))}`)
  }

  listUsers(): Promise<AdminUser[]> {
    return this.request('/admin/v1/users')
  }

  createUser(input: AdminUserCreateInput): Promise<AdminUser> {
    return this.request('/admin/v1/users', { method: 'POST', body: JSON.stringify(input) })
  }

  updateUser(id: string, input: AdminUserUpdateInput): Promise<AdminUser> {
    return this.request(`/admin/v1/users/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) })
  }

  async resetUserPassword(id: string, password: string): Promise<void> {
    await this.request(`/admin/v1/users/${encodeURIComponent(id)}/password`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    })
  }

  async setUserRoles(id: string, roleIds: string[]): Promise<void> {
    await this.request(`/admin/v1/users/${encodeURIComponent(id)}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ roleIds }),
    })
  }

  listRoles(): Promise<AdminRole[]> {
    return this.request('/admin/v1/roles')
  }

  createRole(input: AdminRoleInput): Promise<AdminRole> {
    return this.request('/admin/v1/roles', { method: 'POST', body: JSON.stringify(input) })
  }

  updateRole(id: string, input: AdminRoleInput): Promise<AdminRole> {
    return this.request(`/admin/v1/roles/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) })
  }

  async deleteRole(id: string): Promise<void> {
    await this.request(`/admin/v1/roles/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  async setRolePermissions(id: string, permissionIds: string[]): Promise<void> {
    await this.request(`/admin/v1/roles/${encodeURIComponent(id)}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissionIds }),
    })
  }

  // listPermissions 保留停用节点，以便维护和撤销角色分配。
  listPermissions(): Promise<AdminPermission[]> {
    return this.request('/admin/v1/permissions')
  }

  // createPermission 以独立权限保护节点创建。
  createPermission(input: AdminPermissionInput): Promise<AdminPermission> {
    return this.request('/admin/v1/permissions', { method: 'POST', body: JSON.stringify(input) })
  }

  // updatePermission 整体保存节点资料，保持主键和角色关联。
  updatePermission(id: string, input: AdminPermissionInput): Promise<AdminPermission> {
    return this.request(`/admin/v1/permissions/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) })
  }

  // deletePermission 由服务端检查子节点和角色引用。
  async deletePermission(id: string): Promise<void> {
    await this.request(`/admin/v1/permissions/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }


  // listDramaDistributions 读取短剧所有应用的授权进度。
  listDramaDistributions(id: string): Promise<DramaDistribution[]> { return this.request(`/admin/v1/dramas/${encodeURIComponent(id)}/distributions`) }
  // listApplicationDramaAuthorizations 分页读取当前应用可授权和已关联的短剧。
  listApplicationDramaAuthorizations(applicationId: string, input: ApplicationDramaAuthorizationQuery): Promise<ApplicationDramaAuthorizationPage> {
    const query = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize), view: input.view })
    if (input.query) query.set('query', input.query)
    return this.request(`/admin/v1/applications/${encodeURIComponent(applicationId)}/drama-authorizations?${query}`)
  }
  // setDramaDistribution 在本次请求内独立授权或撤权，直接返回平台结果。
  setDramaDistribution(id: string, applicationId: string, enabled: boolean): Promise<void> { return this.request(`/admin/v1/dramas/${encodeURIComponent(id)}/distributions/${encodeURIComponent(applicationId)}`, { method: 'PUT', body: JSON.stringify({ enabled }) }) }
  // authorizeApplicationDramas 在本次请求内逐项调用官方授权，返回已确认数量。
  authorizeApplicationDramas(applicationId: string, dramaIds: string[]): Promise<{ authorizedCount: number }> { return this.request(`/admin/v1/applications/${encodeURIComponent(applicationId)}/drama-authorizations`, { method: 'POST', body: JSON.stringify({ dramaIds }) }) }
  // listGlobalConfigs 使用全局接口，不依赖当前应用选择。
  listGlobalConfigs(): Promise<GlobalConfig[]> { return this.request('/admin/v1/global-configs') }
  // saveGlobalConfig 提交一条配置，不在浏览器持久化配置或密钥。
  saveGlobalConfig(key: string, value: Record<string, unknown>, remark?: string): Promise<GlobalConfig> {
    return this.request(`/admin/v1/global-configs/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ value, remark }) })
  }
  // deleteGlobalConfig 由服务端校验配置是否允许删除。
  async deleteGlobalConfig(key: string): Promise<void> {
    await this.request(`/admin/v1/global-configs/${encodeURIComponent(key)}`, { method: 'DELETE' })
  }

  // subjectRequest 固定当前页面的主体，渠道由独立路径确定，应用切换不改变审核列表范围。
  private subjectRequest<T>(path: string, init: RequestInit, subjectId: string): Promise<T> {
    if (!subjectId.trim()) return Promise.reject(new ApiError('请先选择主体', 0, 'subject_required'))
    return this.request(path, init, true, 'global', '', subjectId)
  }

  private applicationRequest<T>(path: string, init: RequestInit = {}, applicationId = this.applicationId): Promise<T> {
    if (!applicationId.trim()) {
      return Promise.reject(new ApiError('请先选择应用', 0, 'application_required'))
    }
    return this.request(path, init, true, 'application', applicationId)
  }

  private async request<T>(path: string, init: RequestInit = {}, authenticate = true, scope: 'global' | 'application' = 'global', applicationId = this.applicationId, subjectId = this.subjectId): Promise<T> {
    // 请求发起时固定主体，等待会话续签期间的界面切换不能改变本次读写归属。
    if (authenticate && path !== '/admin/v1/session/refresh') await this.maintainSession()
    const token = this.token
    const headers = new Headers(init.headers)
    headers.set('content-type', 'application/json')
    if (authenticate) headers.set('authorization', `Bearer ${token}`)
    if (authenticate && scope === 'application') headers.set('x-application-id', applicationId)
    // 两个发布通道和运营配置均使用同一可信主体；应用级接口仍由服务端从应用归属解析。
    if (authenticate && scope === 'global' && subjectId && !path.startsWith('/admin/v1/session')) headers.set('x-subject-id', subjectId)
    let response: Response
    try {
      response = await this.fetcher(this.url(path), { ...init, headers })
    } catch {
      throw new ApiError('网络连接失败，请检查网络后重试', 0, 'network_error')
    }
    if (authenticate && response.status === 401) this.expireSession(token)
    const body = await response.text()
    let payload: Envelope<T>
    try {
      payload = JSON.parse(body) as Envelope<T>
    } catch {
      const message = response.status === 404
        ? `接口不存在或服务版本不匹配（HTTP ${response.status}）`
        : `服务返回了无效响应（HTTP ${response.status}）`
      throw new ApiError(message, response.status, 'invalid_response')
    }
    if (!response.ok || payload.code > 0 || payload.data === undefined) {
      throw new ApiError(payload.message ?? `请求失败（HTTP ${response.status}）`, response.status, payload.reason)
    }
    return payload.data
  }

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}${path}`
  }

  private rememberSession(session: AdminSession): AdminSession {
    this.session = session
    this.storage.setItem(this.storageKeys.session, JSON.stringify(session))
    return session
  }
}

// normalizeDrama 只处理服务端允许的空标签，不把其他无效字段静默改成业务数据。
function normalizeDrama(drama: Drama): Drama {
  return { ...drama, tags: drama.tags ?? [] }
}

function directMediaUploadStorageKey(prefix: string, episodeId: string, input: DirectMediaUploadInput): string {
  return `${prefix}direct:${encodeURIComponent(episodeId)}:${encodeURIComponent(input.uploadId)}:${encodeURIComponent(input.vid)}:${encodeURIComponent(input.fileName)}:${input.size}`
}

function createMediaIdempotencyKey(): string {
  const suffix = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `media-${suffix}`
}

function parseSession(value: string | null): AdminSession | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as AdminSession
    return parsed?.user?.id && Array.isArray(parsed.permissions) && Array.isArray(parsed.menus) ? parsed : null
  } catch {
    return null
  }
}
