/** 使用实际报表组件和示例奖励数据检查桌面与移动交互，不访问业务服务。 */
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import 'antd/dist/reset.css'
import '../../src/theme.css'
import { CampaignReportPage } from '../../src/features/growth/CampaignReportPage'
import type { OperationsApi } from '../../src/api'
import type { Application } from '../../src/applications'
import type { CampaignReportQuery } from '../../src/campaignReport'
const rows = [
 { campaignId: '8801', applicationId: '101', applicationName: '小程序 A', name: '逆风归来 · 素材一', code: 'hook-a', dramaTitle: '逆风归来', landingUrl: '', status: 'active', rewardUsers: 1280, rewardCompletions: 3840, episodeRewards: 3200, vipRewards: 640, averageRewards: 3 },
 { campaignId: '8802', applicationId: '102', applicationName: '小程序 B', name: '逆风归来 · 素材二', code: 'hook-b', dramaTitle: '逆风归来', landingUrl: '', status: 'disabled', rewardUsers: 650, rewardCompletions: 2730, episodeRewards: 2000, vipRewards: 730, averageRewards: 4.2 },
 { campaignId: '8803', applicationId: '101', applicationName: '小程序 A', name: '尚无奖励的链接', code: 'hook-c', dramaTitle: '重逢之后', landingUrl: '', status: 'active', rewardUsers: 0, rewardCompletions: 0, episodeRewards: 0, vipRewards: 0, averageRewards: null },
]
const api = { campaignReport: async (query: CampaignReportQuery) => {
 const items = rows.filter(row => (!query.applicationId || row.applicationId === query.applicationId) && (!query.query || row.name.includes(query.query) || row.code.includes(query.query)))
 items.sort((a,b) => { const av=a[query.sort],bv=b[query.sort];return av==null?bv==null?0:1:bv==null?-1:(av-bv)*(query.direction==='asc'?1:-1) })
 return { items, total: items.length }
} } as unknown as OperationsApi
createRoot(document.getElementById('root')!).render(<ConfigProvider theme={{ token: { motion: false } }}><main style={{ padding: 16 }}><p>界面检查 · 以下为示例数据</p><CampaignReportPage api={api} applications={[{ id: '101', name: '小程序 A' }, { id: '102', name: '小程序 B' }] as Application[]} /></main></ConfigProvider>)
