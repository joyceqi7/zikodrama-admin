/** 实际报表组件与示例账本数据，不访问业务库或官方服务。 */
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import 'antd/dist/reset.css'
import '../../src/theme.css'
import { DramaReportPage } from '../../src/features/growth/DramaReportPage'
import type { OperationsApi } from '../../src/api'
import type { Application } from '../../src/applications'
import type { DramaReportQuery } from '../../src/dramaReport'
const rows = [{ dramaId: '215', title: '逆风归来', playUsers: null, firstEpisodeCompletionRate: null, unlockUsers: 1280, unlockCount: 3840, averageUnlocks: 3 }, { dramaId: '216', title: '重逢之后', playUsers: null, firstEpisodeCompletionRate: null, unlockUsers: 650, unlockCount: 2730, averageUnlocks: 4.2 }, { dramaId: '217', title: '暂无解锁的剧', playUsers: null, firstEpisodeCompletionRate: null, unlockUsers: 0, unlockCount: 0, averageUnlocks: null }]
const api = { dramaReport: async (query: DramaReportQuery) => {
  const items = rows.filter(row => !query.query || row.dramaId === query.query || row.title.includes(query.query)).map(row => ({ ...row, unlockUsers: query.applicationId ? Math.floor(row.unlockUsers/2) : row.unlockUsers }))
  items.sort((a,b) => { const av = a[query.sort], bv = b[query.sort]; return av == null ? bv == null ? 0 : 1 : bv == null ? -1 : (av-bv)*(query.direction==='asc'?1:-1) })
  return { items, total: items.length }
}, dramaReportEpisodes: async () => [{ episodeNumber: 1, rewardUsers: 580, rewardCompletions: 1100 }, { episodeNumber: 4, rewardUsers: 420, rewardCompletions: 890 }, { episodeNumber: 7, rewardUsers: 280, rewardCompletions: 650 }] } as unknown as OperationsApi
createRoot(document.getElementById('root')!).render(<ConfigProvider theme={{ token: { motion: false } }}><main style={{ padding: 16 }}><p>界面检查 · 以下为示例数据</p><DramaReportPage api={api} applications={[{ id: '101', name: '小程序 A' }, { id: '102', name: '小程序 B' }] as Application[]} /></main></ConfigProvider>)
