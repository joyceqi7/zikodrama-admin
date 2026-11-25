/** 真实页面与报表测试替身，不访问业务库或官方服务。 */
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import 'antd/dist/reset.css'
import '../../src/theme.css'
import { RewardAnalysisPage } from '../../src/features/growth/RewardAnalysisPage'
import type { OperationsApi } from '../../src/api'
import type { Application } from '../../src/applications'
import type { RewardReportQuery } from '../../src/rewardAnalysis'
const apps = [{id:'101',name:'小程序 A'},{id:'102',name:'小程序 B'},{id:'103',name:'空数据小程序'}] as Application[]
const dramas = [{dramaId:'201',title:'逆风归来',rewardCompletions:1200,rewardUsers:300},{dramaId:'202',title:'重逢之后',rewardCompletions:800,rewardUsers:200},{dramaId:'203',title:'心动倒计时',rewardCompletions:400,rewardUsers:160}]
const campaigns = [{campaignId:'9801',applicationId:'101',applicationName:'小程序 A',name:'首集入口 A',code:'entry_a',dramaTitle:'逆风归来',landingUrl:'https://example.test/a',rewardCompletions:1000,rewardUsers:250,episodeRewards:800,vipRewards:200},{campaignId:'9802',applicationId:'102',applicationName:'小程序 B',name:'首集入口 B',code:'entry_b',dramaTitle:'逆风归来',landingUrl:'https://example.test/b',rewardCompletions:600,rewardUsers:200,episodeRewards:500,vipRewards:100}]
const api = {
 rewardAnalysis: async (q: RewardReportQuery) => ({dramas:q.applicationId==='103'?[]:dramas,campaigns:campaigns.filter(r=>!q.applicationId||r.applicationId===q.applicationId),unassignedVip:{rewardCompletions:600,rewardUsers:150}}),
 rewardEpisodes: async () => [{episodeNumber:6,rewardCompletions:600,rewardUsers:250},{episodeNumber:7,rewardCompletions:400,rewardUsers:180},{episodeNumber:8,rewardCompletions:200,rewardUsers:100}],
 rewardTrend: async (_dimension:string,_id:string,q:RewardReportQuery) => ({days:Array.from({length:7},(_v,i)=>({date:new Date(Date.parse(q.from)+i*86400000).toISOString().slice(0,10),rewardCompletions:[20,35,40,50,45,60,30][i],rewardUsers:[8,12,15,18,12,20,10][i]})),total:{rewardCompletions:280,rewardUsers:70}}),
} as unknown as OperationsApi
createRoot(document.getElementById('root')!).render(<ConfigProvider theme={{token:{motion:false}}}><main style={{padding:16}}><p>界面测试 · 以下为示例数据</p><RewardAnalysisPage api={api} applications={apps} /></main></ConfigProvider>)
