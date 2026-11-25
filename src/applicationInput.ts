import type { Application, ApplicationInput } from './applications'

// toApplicationInput 组装应用资料与广告位，TikTok 发布方由所属主体管理。
export function toApplicationInput(application: Application): ApplicationInput {
  return {
    subjectId: application.subjectId,
    name: application.name,
    logoUrl: application.logoUrl,
    tiktokAppId: application.tiktokAppId,
    clientKey: application.clientKey,
    secretRef: application.secretRef,
    regionCode: application.regionCode,
    timeZone: application.timeZone,
    complianceBaseUrl: application.complianceBaseUrl,
    adUnits: {
      rewardedVideo: [...(application.adUnits?.rewardedVideo ?? [])],
      interstitial: [...(application.adUnits?.interstitial ?? [])],
    },
    monetizationMode: application.monetizationMode ?? 'IAA',
    status: application.status,
  }
}
