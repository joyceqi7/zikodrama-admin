/** 生产短剧列表与授权明细的示例数据，不访问业务或平台服务。 */
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import 'antd/dist/reset.css'
import '../../src/theme.css'
import { Dashboard } from '../../src/features/dramas/Dashboard'
import type { OperationsApi } from '../../src/api'
import type { DramaListItem } from '../../src/domain'
import type { Application } from '../../src/applications'
const applications = [{ id: '101', name: '发布小程序 A' }, { id: '102', name: '小程序 B' }, { id: '103', name: '小程序 C' }, { id: '104', name: '小程序 D' }] as Application[]
const base: DramaListItem = { id: '215', title: '逆风归来', coverUrl: '', status: 'completed', year: 2026, tags: [], publishStatus: 'published', onlineVersion: 2, ownerApplicationId: '101', authorizedApplicationCount: 1, episodeCount: 60, readyEpisodeCount: 60 }
const dramas = [base, { ...base, id: '216', title: '重逢之后', authorizedApplicationCount: 0 }, { ...base, id: '217', title: '待上线短剧', onlineVersion: undefined, publishStatus: 'draft' }]
const api = { listDramaDistributions: async () => [
  { dramaId: '215', applicationId: '102', ownerApplicationId: '101', enabled: true, desiredAuthorized: true, status: 'authorized' },
  { dramaId: '215', applicationId: '103', ownerApplicationId: '101', enabled: true, desiredAuthorized: true, status: 'pending' },
  { dramaId: '215', applicationId: '104', ownerApplicationId: '101', enabled: true, desiredAuthorized: true, status: 'failed' },
] } as unknown as OperationsApi
createRoot(document.getElementById('root')!).render(<ConfigProvider theme={{ token: { motion: false } }}><main style={{ padding: 16 }}><p>界面检查 · 以下为示例数据</p><Dashboard api={api} applications={applications} dramas={dramas} query={{ page: 1, pageSize: 20 }} total={3} onQueryChange={() => {}} loading={false} canCreate={false} canPublish={false} onCreate={() => {}} onRefresh={() => {}} onSelect={() => {}} onOpenPublication={() => {}} /></main></ConfigProvider>)
