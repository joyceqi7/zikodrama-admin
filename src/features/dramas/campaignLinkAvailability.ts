import type { DramaListItem } from '../../domain'

/** hasOnlineCampaignTarget 按目标 Mini 的播放通道检查线上内容；直连上线不依赖 TikTok 审核。
 * 应用状态、播放授权和线上第一集仍由生成链接的服务端接口校验。
 */
export function hasOnlineCampaignTarget(drama: DramaListItem, applicationProvider?: string): boolean {
  if (applicationProvider === 'byteplus_web') {
    return drama.directPublication?.status === 'published'
  }
  return drama.officialRelease?.status === 'online' || Boolean(drama.onlineVersion)
}
