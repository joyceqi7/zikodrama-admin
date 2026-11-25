/** 仅用于真实分类榜组件的桌面及移动检查，数据留在测试页面内。 */
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { CategoryRankingManagement } from '../../src/features/dramas/CategoryRankingManagement'
import type { OperationsApi } from '../../src/api'
import type { RankingConfig, RankingView } from '../../src/categoryRankings'
let stored: RankingView = { revision: 1, items: [{ dramaId: '1', visible: true }, { dramaId: '2', visible: false }], dramas: [{ id: '1', title: 'First Drama', coverUrl: '' }, { id: '2', title: 'Second Drama', coverUrl: '' }] }
const api = {
 rankingCategories: async () => [{ tag: { id: '21', officialName: '悬疑推理', englishName: 'Mystery' }, count: 2 }],
 categoryRanking: async () => stored,
 saveCategoryRanking: async (_tag: string, input: RankingConfig) => { stored = { ...stored, ...input, revision: input.revision + 1 }; return stored },
} as unknown as OperationsApi
createRoot(document.getElementById('root')!).render(<ConfigProvider theme={{ token: { motion: false } }}><main style={{ padding: 16 }}><CategoryRankingManagement api={api} canUpdate notify={() => {}} /></main></ConfigProvider>)
