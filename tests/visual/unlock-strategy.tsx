/** 真实解锁策略面板的本地交互检查，仅保存示例配置，不请求业务或广告平台。 */
import { createRoot } from 'react-dom/client'
import { ConfigProvider, message } from 'antd'
import 'antd/dist/reset.css'
import '../../src/theme.css'
import { consoleTheme } from '../../src/app/theme'
import type { OperationsApi } from '../../src/api'
import type { Application } from '../../src/applications'
import type { ApplicationStrategy, ApplicationStrategyInput } from '../../src/domain'
import { UnlockStrategyManagement } from '../../src/features/monetization/UnlockStrategyManagement'

const application: Application = {
  id: '1', subjectId: '1', name: '示例广告应用', tiktokAppId: '000123', clientKey: 'sample-key',
  logoUrl: '', secretRef: '', regionCode: 'GLOBAL', timeZone: 'UTC', complianceBaseUrl: '',
  monetizationMode: 'IAA', status: 'active', createdAt: '', updatedAt: '',
  adUnits: { rewardedVideo: ['reward-episode'], interstitial: ['launch-interstitial'] },
}
let snapshot: ApplicationStrategy = { applicationId: '1', monetizationMode: 'IAA', strategy: null, rules: {} }
const api = {
  getApplicationStrategy: async () => snapshot,
  saveApplicationStrategy: async (input: ApplicationStrategyInput) => {
    snapshot = { ...snapshot, rules: input.rules, strategy: { id: '1', revision: (snapshot.strategy?.revision ?? 0) + 1, document: input.document, createdAt: '', updatedAt: '' } }
    return snapshot
  },
} as unknown as OperationsApi

/** UnlockStrategyPreview 展示默认集数、插屏开关及保存后的真实回显。 */
export function UnlockStrategyPreview() {
  const [messageApi, context] = message.useMessage()
  return <main style={{ padding: 16, maxWidth: 1280, margin: 'auto' }}>
    {context}
    <UnlockStrategyManagement api={api} application={application} canUpdate notify={(content, tone = 'success') => { void messageApi.open({ type: tone, content }) }} />
  </main>
}
createRoot(document.getElementById('root')!).render(<ConfigProvider theme={consoleTheme}><UnlockStrategyPreview /></ConfigProvider>)
