/** 应用广告位交互验收仅使用本地示例数据，不请求服务端或广告平台。 */
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { ConfigProvider, message } from 'antd'
import 'antd/dist/reset.css'
import '../../src/theme.css'
import { consoleTheme } from '../../src/app/theme'
import type { OperationsApi } from '../../src/api'
import type { Application, ApplicationCreateInput, ApplicationInput } from '../../src/applications'
import { ApplicationManagement } from '../../src/features/applications/ApplicationManagement'

const initial: Application = {
  id: '1', subjectId: '1', name: '示例广告应用', tiktokAppId: '0007637420375425239060',
  clientKey: 'sample-client-key', clientSecretConfigured: true, secretRef: '', logoUrl: '',
  regionCode: 'GLOBAL', timeZone: 'UTC', complianceBaseUrl: '', monetizationMode: 'IAA',
  status: 'active', playbackProvider: 'tiktok_minis', playbackRevision: 0,
  adUnits: { rewardedVideo: ['reward-episode', '9007199254740993'], interstitial: ['launch-interstitial'] },
  createdAt: '', updatedAt: '',
}

/** ApplicationAdsPreview 为桌面与手机视口提供可编辑的应用及广告位示例。 */
export function ApplicationAdsPreview() {
  const [applications, setApplications] = useState([initial])
  const [messageApi, context] = message.useMessage()
  const api = {
    createApplication: async (input: ApplicationCreateInput) => ({ ...initial, ...input, id: String(applications.length + 1), status: 'disabled' as const, adUnits: input.adUnits ?? { rewardedVideo: [], interstitial: [] } }),
    updateApplication: async (id: string, input: ApplicationInput) => ({ ...initial, ...input, id }),
  } as unknown as OperationsApi
  return <main style={{ padding: 16 }}>
    {context}
    <ApplicationManagement subjectId="1" api={api} applications={applications} canCreate canUpdate canDistribute={false} loading={false} onRefresh={async () => {}} onChanged={saved => setApplications(items => [...items.filter(item => item.id !== saved.id), saved])} notify={(content, tone = 'success') => { void messageApi.open({ type: tone, content }) }} />
  </main>
}

createRoot(document.getElementById('root')!).render(<ConfigProvider theme={consoleTheme}><ApplicationAdsPreview /></ConfigProvider>)
