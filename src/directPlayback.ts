import type { Drama } from "./domain";
import type { CarouselDrama } from "./homepage";

/** DirectPublication 保存直连指针，修订用于并发保护。 */
export interface DirectPublication {
  /** dramaId 是共享内容主键。 */
  dramaId: string;
  /** status 不依赖官方审核或上线状态。 */
  status: "unpublished" | "published" | "offline";
  /** revision 用于拒绝过期的管理操作。 */
  revision: number;
  /** currentVersionId 是保留的不可变版本。 */
  currentVersionId?: string;
}
/** DirectCommand 固定一次可恢复操作的输入。 */
export interface DirectCommand {
  /** requestId 重试时保持原值。 */
  requestId: string;
  /** expectedRevision 是提交时观察到的发布修订。 */
  expectedRevision: number;
  /** kind 区分上架当前已保存内容和下架。 */
  kind: "publish" | "offline" | "relist";
}
/** DirectOperation 保存同步上下架的持久化操作事实，失败原因不包含云凭据。 */
export interface DirectOperation {
  /** id 是操作主键。 */
  id: string;
  /** dramaId 是关联内容。 */
  dramaId: string;
  /** command 保存原始幂等命令。 */
  command: DirectCommand;
  /** status 是已完成操作的结果。 */
  status: "succeeded";
  /** resultVersionId 是操作生效后的版本。 */
  resultVersionId?: string;
  /** createdAt 是提交时间。 */
  createdAt: string;
}
/** DirectWorkbench 分开展示草稿、不可变版本与全直连共用的上架指针。 */
export interface DirectWorkbench {
  /** summary 是当前版本、待发布修改和最近操作的摘要。 */
  summary?: DirectSummary;
  /** publication 是本渠道的指针。 */
  publication: DirectPublication;
  /** draft 是共享内容，列表仅包含摘要。 */
  draft: Drama;
  /** sourceDigest 是编辑内容摘要，直连上架时冻结就绪内容。 */
  sourceDigest: string;
  /** versions 是该剧的直连发布版本，TK 使用独立的官方版本和任务快照。 */
  versions: {
    /** id 是不可变版本主键。 */
    id: string;
    /** number 是本剧在直连渠道内的发布版本序号。 */
    number: number;
    /** sourceDigest 固定发布时的完整内容。 */
    sourceDigest: string;
    /** snapshot 是不随草稿更新的内容。 */
    snapshot: Drama;
    /** createdAt 是发布动作冻结版本的时间。 */
    createdAt: string;
    /** createdBy 是确认内容的管理员标识。 */
    createdBy?: string;
  }[];
}
/** ApplicationHomePreview 使用真实应用可见性投影，空栏目不回退。 */
export interface ApplicationHomePreview {
  /** omittedSections 表示当前账号无权读取的栏目，不包含其配置。 */
  omittedSections?: string[];
  /** carousel 是该应用实际可见轮播。 */
  carousel: CarouselDrama[];
  /** hot 是该应用实际可见热播。 */
  hot: CarouselDrama[];
  /** rankings 是该应用非空分类榜。 */
  rankings: {
    /** tagId 是共享标签标识，所属成员来自预览渠道。 */
    tagId: string;
    /** name 是该标签当前的站内显示名称。 */
    name: string;
    /** dramas 仅包含该应用实际可见的线上成员。 */
    dramas: CarouselDrama[];
  }[];
  /** filtered 解释隐藏、下架、未关联及应用停用的条目。 */
  filtered?: {
    /** module 是过滤发生的栏目或分类。 */
    module: string;
    /** dramaId 是被过滤的内部短剧主键。 */
    dramaId: string;
    /** title 是该渠道的线上名称。 */
    title: string;
    /** reason 是友好提示使用的稳定原因码。 */
    reason: string;
  }[];
}

/** DirectSummary 是管理端的直连线上状态，与官方状态并列展示。 */
export interface DirectSummary {
  /** revision 绑定列表所见的发布修订，防止操作过期状态。 */
  revision: number;
  /** status 是独立渠道状态。 */
  status: string;
  /** version 是当前版本序号，下架后仍保留。 */
  version: number;
  /** versionId 是当前版本主键。 */
  versionId?: string;
  /** enabledApplications 只统计有效应用。 */
  enabledApplications: number;
  /** lastOperation 保存最近完成的操作。 */
  lastOperation?: DirectOperation;
  /** pendingChanges 比较草稿与线上摘要。 */
  pendingChanges: boolean;
  /** publishedAt 是版本创建时间。 */
  publishedAt?: string;
  /** publishedBy 是发布管理员标识。 */
  publishedBy?: string;
}
