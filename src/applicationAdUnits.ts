import type { ApplicationAdUnits } from './applications'

/** maxRewardedAdUnits 是单应用激励候选集合的业务上限，与服务端入口保持一致。 */
export const maxRewardedAdUnits = 20

/** ApplicationAdUnitFormValue 让应用资料和列表内广告位配置共用输入格式。 */
export interface ApplicationAdUnitFormValue {
  /** 每个输入框维护一个激励候选编码。 */
  rewardedVideo: string[]
  /** 插屏只维护一个编码，保存时转换回原有数组合同。 */
  interstitial: string
}

/** applicationAdUnitFormValue 回显已有广告位；历史多个插屏必须由运营明确选择。 */
export function applicationAdUnitFormValue(units?: ApplicationAdUnits): ApplicationAdUnitFormValue {
  return {
    rewardedVideo: units?.rewardedVideo.length ? [...units.rewardedVideo] : [''],
    interstitial: units?.interstitial.length === 1 ? units.interstitial[0] : '',
  }
}

/** toApplicationAdUnits 裁剪、去空及去重后继续提交原有广告位数组。 */
export function toApplicationAdUnits(value: ApplicationAdUnitFormValue): ApplicationAdUnits {
  return {
    rewardedVideo: parseRewardedAdUnits((value.rewardedVideo ?? []).join('\n')),
    interstitial: value.interstitial?.trim() ? [value.interstitial.trim()] : [],
  }
}

/** parseRewardedAdUnits 将每行一个的广告位输入裁剪、去空及去重，编码始终保持字符串。 */
export function parseRewardedAdUnits(value: string): string[] {
  return [...new Set(value.split(/\r?\n/).map(code => code.trim()).filter(Boolean))]
}

/** applicationAdUnitsError 检查激励候选集合与单个插屏配置，供应用启用和策略绑定共用。 */
export function applicationAdUnitsError(units: ApplicationAdUnits): string {
  if (!units.rewardedVideo.length || units.rewardedVideo.length > maxRewardedAdUnits || units.rewardedVideo.some(code => !code.trim() || code.trim().length > 255)) {
    return `请在「应用管理」的广告位配置中填写 1–${maxRewardedAdUnits} 个激励视频 code，每个最多 255 个字符`
  }
  if (units.interstitial.length !== 1 || !units.interstitial[0].trim() || units.interstitial[0].trim().length > 255) {
    return '请在「应用管理」的广告位配置中填写一个插屏 code'
  }
  return ''
}
