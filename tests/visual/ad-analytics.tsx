/** 广告诊断界面验收使用固定示例，不访问业务库或 TikTok 服务。 */
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import 'antd/dist/reset.css'
import '../../src/theme.css'
import { AdAnalyticsPage } from '../../src/features/growth/AdAnalyticsPage'
import type { OperationsApi } from '../../src/api'
import type { AdAnalytics } from '../../src/adAnalytics'
const data: AdAnalytics = {
  summary: { calls: 10, requests: 9, shown: 7, matchedShown: 7, completed: 5, failedBeforeShow: 2, failedAfterShow: 0, createFailures: 0, cancelled: 2, unknown: 0, closeUnknown: 0, pending: 0, skipped: 1, timingSamples: 7, p50Ms: 100, p95Ms: 500 }, daily: [],
  errors: [{ stage: 'show', errorCode: '50008', subErrorCode: '50008', reason: 'container_unavailable', count: 2 }],
  items: [{ userId: '9007199254740993', eventId: 'example-ad-call-b', occurredAt: new Date().toISOString(), adType: 'rewarded', adUnitId: 'example-slot', scene: 'entry_reward', clientVersion: 'example-build', requested: 1, shown: 0, completed: 0, failed: 1, cancelled: 0, unknown: 0, closed: 0, skipped: 0, events: [{
    kind: 'ad_failure', stage: 'show', reason: 'container_unavailable', errorCode: '101150000', subErrorCode: '50000', innerErrorCode: '50008', elapsedMs: 112, showElapsedMs: 100, os: 'ios', tiktokVersion: '46.1', receivedAt: new Date().toISOString(),
  }] }], hasMore: false, nextCursor: '', generatedAt: new Date().toISOString(),
}
const api = { adAnalytics: async () => data } as unknown as OperationsApi
createRoot(document.getElementById('root')!).render(<ConfigProvider theme={{ token: { motion: false } }}><main style={{ padding: 16 }}><p>界面测试 · 以下为示例数据</p><AdAnalyticsPage api={api} applicationId="101" applicationName="示例应用" notify={() => {}} /></main></ConfigProvider>)
