/** 使用生产仪表盘和静态测试数据验证投放排行，不连接业务或官方服务。 */
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider, Select } from 'antd'
import 'antd/dist/reset.css'
import '../../src/theme.css'
import { AnalyticsDashboard } from '../../src/features/growth/AnalyticsDashboard'
import type { OperationsApi } from '../../src/api'
/** Preview 通过应用切换和时间范围模拟真实排行查询。 */
export function Preview() {
 const [app, setApp] = useState('101')
 const api = useMemo(() => ({ dashboard: async (_from: string, _to: string, scope: string) => ({ timeZone: 'UTC', generatedAt: new Date().toISOString(), days: [{ date: new Date().toISOString().slice(0,10), newUsers: 12, rewardCompletions: 8, episodeUnlocks: 6, vipActivations: 2 }], campaignRanking: app === '102' ? [] : Array.from({ length: 12 }, (_v,i) => ({ campaignId: String(i+1), name: `短剧投放 ${i+1}`, code: `drama_link_${i+1}`, landingUrl: 'https://example.test/link', rewardCompletions: (scope === 'all' ? 800 : 80)-i*3, rewardUsers: 20-i })) }) } as unknown as OperationsApi), [app])
 return <main style={{ padding: 16 }}><AnalyticsDashboard api={api} applicationId={app} applicationFilter={<Select aria-label="测试小程序" value={app} onChange={setApp} options={[{value:'101',label:'测试小程序 A'},{value:'102',label:'测试小程序 B（空数据）'}]} />} /></main>
}
createRoot(document.getElementById('root')!).render(<ConfigProvider theme={{token:{motion:false}}}><Preview /></ConfigProvider>)
