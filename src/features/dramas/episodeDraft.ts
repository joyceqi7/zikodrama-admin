import type { Episode, MediaJob } from '../../domain'

// EpisodeUploadState 是分集上传流程的可见状态。
export type EpisodeUploadState = 'missing' | 'waiting' | 'uploading' | 'processing' | 'ready' | 'failed'

// EpisodeDraft 组合可保存的分集资料与当前浏览器的上传恢复状态。
export interface EpisodeDraft {
  // clientId 是本地清单稳定标识，保存与集序调整时保持不变。
  clientId: string
  // id 是服务端分配的分集字符串标识。
  id?: string
  // number 是从 1 开始的连续集序。
  number: number
  // title 是当前分集标题。
  title: string
  // description 是当前分集简介。
  description: string
  // posterUrl 是服务端媒资结果中的封面地址。
  posterUrl: string
  // durationSeconds 是媒资确认后的有效时长。
  durationSeconds: number
  // vid 是已绑定的 VOD 字符串标识。
  vid: string
  // platformEpisodeId 是 TikTok 官方分集标识，仅用于展示和审核定位。
  platformEpisodeId?: string
  // file 是仅存在当前页面的待上传文件。
  file?: File
  // expectedFileName 用于确认上传或提示重新选择原文件。
  expectedFileName?: string
  // expectedFileSize 是原文件字节数。
  expectedFileSize?: number
  // expectedFileLastModified 用于刷新后核对重新选择的原文件。
  expectedFileLastModified?: number
  // expectedFileType 是原文件的浏览器 MIME 类型，可能为空字符串。
  expectedFileType?: string
  // expectedFileFingerprint 是首尾片段摘要，用于避免同名同大小文件误续传。
  expectedFileFingerprint?: string
  // pendingVid 是已直传但尚未完成业务确认的 VOD 标识。
  pendingVid: string
  // pendingUploadId 是服务端上传登记标识。
  pendingUploadId?: string
  // pendingUploadRequestId 用于重试原上传结果的业务确认。
  pendingUploadRequestId: string
  // mediaJobId 是已进入服务端的处理任务标识。
  mediaJobId?: string
  // uploadState 区分文件选择、传输、处理和失败。
  uploadState: EpisodeUploadState
  // progress 只表示文件传输百分比。
  progress: number
  // error 是经过统一映射后可展示的失败原因。
  error: string
  // autoTitle 表示集序调整时是否同步自动标题。
  autoTitle: boolean
}

// isSupportedMediaFileName 检查官方上传入口接受的视频文件扩展名。
export function isSupportedMediaFileName(name: string): boolean {
  return /\.(mp4|mov|mkv|avi|flv|mpeg|mts|m4s|wmv|rm|rmvb)$/i.test(name.trim())
}

// shouldRetryMediaJob 仅对已取得 VOD VID 且没有替换文件的失败处理任务执行重试。
// 未取得 VID 代表文件尚未上传成功，必须重新选择本地文件，不能请求后台处理重试。
export function shouldRetryMediaJob(episode: EpisodeDraft): boolean {
  return episode.uploadState === 'failed' && Boolean(episode.mediaJobId) && Boolean(episode.pendingVid) && !episode.file
}

// canResumeDirectConfirmation 确认已有 VID 和完整原文件元数据能否直接恢复业务登记。
export function canResumeDirectConfirmation(episode: EpisodeDraft): boolean {
  // 已存在服务端任务时只轮询或重试任务，不再提交上传确认。
  return !episode.file
    && !episode.mediaJobId
    && Boolean(episode.pendingUploadId)
    && Boolean(episode.pendingVid)
    && Boolean(episode.expectedFileName)
    && (episode.expectedFileSize ?? 0) > 0
}

// hasMediaWorkToSubmit 只选择尚未传输或失败后可恢复的分集，跳过缺文件和正在处理的任务。
export function hasMediaWorkToSubmit(episodes: EpisodeDraft[]): boolean {
  return episodes.some((episode) => ['missing', 'waiting', 'failed'].includes(episode.uploadState) && (
    Boolean(episode.file) || shouldRetryMediaJob(episode) || canResumeDirectConfirmation(episode)
  ))
}

// reconcileEpisodeDraft 合并保存后的字符串 ID 与媒资信息，保留本地文件和失败恢复状态。
export function reconcileEpisodeDraft(episode: EpisodeDraft, persisted: Episode): EpisodeDraft {
  const common = {
    ...episode,
    id: persisted.id,
    vid: persisted.vid,
    platformEpisodeId: persisted.platformEpisodeId,
    posterUrl: persisted.posterUrl,
    durationSeconds: persisted.durationSeconds,
  }
  if (episode.file) return common
  if (persisted.mediaStatus === 'ready' && persisted.vid) {
    return {
      ...common,
      file: undefined,
      pendingVid: '',
      pendingUploadId: '',
      pendingUploadRequestId: '',
      expectedFileName: undefined,
      expectedFileSize: undefined,
      expectedFileLastModified: undefined,
      expectedFileType: undefined,
      expectedFileFingerprint: undefined,
      uploadState: 'ready',
      progress: 100,
      error: '',
    }
  }
  if (episode.pendingVid || episode.mediaJobId || episode.uploadState === 'failed') return common
  return { ...common, uploadState: 'missing', progress: 0 }
}

// mergeEpisodeMediaJobs 按分集和任务字符串标识合并服务端处理结果，保留新选文件。
export function mergeEpisodeMediaJobs(episodes: EpisodeDraft[], jobs: MediaJob[]): EpisodeDraft[] {
  const jobsByEpisode = new Map(jobs.map((job) => [job.episodeId, job]))
  return episodes.map((episode) => {
    const job = episode.id ? jobsByEpisode.get(episode.id) : undefined
    if (!job || episode.file || (episode.mediaJobId && episode.mediaJobId !== job.jobId)) return episode
    if (!episode.mediaJobId && episode.pendingVid && episode.pendingVid !== job.remoteVid) return episode
    return { ...episode, ...mediaJobPatch(episode, job) }
  })
}

// mediaJobPatch 将处理任务映射为单集状态；成功时合并已确认的媒资。
export function mediaJobPatch(episode: EpisodeDraft, job: MediaJob): Partial<EpisodeDraft> {
  if (job.status === 'succeeded' && job.episode) {
    return { ...readyEpisodePatch(job.episode), mediaJobId: job.jobId }
  }
  const common = {
    mediaJobId: job.jobId,
    pendingUploadId: job.jobId,
    // 服务端任务是远端接收状态的权威来源；空 VID 表示本次上传没有形成可继续确认的媒资。
    pendingVid: job.remoteVid,
    pendingUploadRequestId: job.uploadRequestId || episode.pendingUploadRequestId,
    expectedFileName: job.fileName || episode.expectedFileName,
    expectedFileSize: job.size || episode.expectedFileSize,
    progress: 100,
  }
  if (job.status === 'failed') {
    const error = job.remoteVid
      ? '视频处理失败，请重试；仍无法完成时可重新选择视频'
      : '视频尚未上传成功，请重新选择视频上传'
    return { ...common, file: undefined, uploadState: 'failed', error }
  }
  return { ...common, file: undefined, uploadState: 'processing', error: '' }
}

// readyEpisodePatch 生成媒资就绪补丁并清除本地上传恢复信息。
export function readyEpisodePatch(episode: Episode): Partial<EpisodeDraft> {
  return {
    id: episode.id,
    vid: episode.vid,
    platformEpisodeId: episode.platformEpisodeId,
    posterUrl: episode.posterUrl,
    durationSeconds: episode.durationSeconds,
    file: undefined,
    pendingVid: '',
    pendingUploadId: '',
    pendingUploadRequestId: '',
    expectedFileName: undefined,
    expectedFileSize: undefined,
    expectedFileLastModified: undefined,
    expectedFileType: undefined,
    expectedFileFingerprint: undefined,
    uploadState: 'ready',
    progress: 100,
    error: '',
  }
}

// episodeDraftsFromEpisodes 从已保存分集恢复编辑状态，不伪造本地文件。
export function episodeDraftsFromEpisodes(episodes: Episode[]): EpisodeDraft[] {
  return episodes.map((episode) => {
    return {
      clientId: episode.id,
      id: episode.id,
      number: episode.number,
      title: episode.title,
      description: episode.description,
      posterUrl: episode.posterUrl,
      durationSeconds: episode.durationSeconds,
      vid: episode.vid,
      platformEpisodeId: episode.platformEpisodeId,
      pendingVid: '',
      pendingUploadId: '',
      pendingUploadRequestId: '',
      uploadState: episode.mediaStatus === 'ready' && episode.vid ? 'ready' : 'missing',
      progress: episode.mediaStatus === 'ready' ? 100 : 0,
      error: '',
      autoTitle: false,
    }
  })
}

// updateEpisodeDraftContent 更新指定分集文案并保留其媒资和临时文件。
export function updateEpisodeDraftContent(
  drafts: EpisodeDraft[],
  clientId: string,
  input: { title: string; description: string },
  fallbackTitle: string,
): EpisodeDraft[] {
  const title = input.title.trim() || fallbackTitle
  const description = input.description.trim()

  return drafts.map((draft) => draft.clientId === clientId ? {
    ...draft,
    title,
    description,
    autoTitle: draft.autoTitle && title === fallbackTitle,
  } : draft)
}
