/** 剧创风格视觉验收：装配实际后台外壳，示例会话及数据仅存在于测试入口。 */
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import 'antd/dist/reset.css'
import '../../src/theme.css'
import { OperationsConsole } from '../../src/app/OperationsConsole'
import { consoleTheme } from '../../src/app/theme'
import type { OperationsApi } from '../../src/api'
import { permissionCodes, type AdminSession, type DramaListItem, type DramaListQuery } from '../../src/domain'
import type { Application } from '../../src/applications'

const session: AdminSession = {
  user: { id: 'visual-admin', username: 'preview', nickname: '示例管理员', status: 'active', isSuper: false, roleIds: [], createdAt: '', updatedAt: '' },
  permissions: [permissionCodes.dramaRead, permissionCodes.dramaCreate, permissionCodes.mediaUpload, permissionCodes.applicationRead, permissionCodes.applicationCreate, permissionCodes.applicationUpdate],
  menus: [
    { id: 'content', name: '内容管理', route: '', icon: 'clapperboard', children: [
      { id: 'dramas', name: '短剧管理', route: 'dramas', children: [] },
      { id: 'official', name: '官方发布', route: 'officialPublications', children: [] },
    ] },
    { id: 'operations', name: '应用运营', route: '', icon: 'panels-top-left', children: [
      { id: 'applications', name: 'TikTok 应用', route: 'applications', children: [] },
      { id: 'ads', name: '广告配置', route: 'adConfiguration', children: [] },
    ] },
  ],
}
const applications: Application[] = ['Drama Studio', 'Short Stories'].map((name, index) => ({
  id: `visual-app-${index}`, name: `${name}（示例）`, logoUrl: '', tiktokAppId: `000000000000000000${index}`,
  clientKey: `preview-${index}`, clientSecretConfigured: true, secretRef: '', regionCode: 'GLOBAL', timeZone: 'UTC', complianceBaseUrl: '',
  adUnits: { rewardedVideo: ['preview-reward'], interstitial: [] }, monetizationMode: 'IAA', status: 'active',
  playbackProvider: 'byteplus_web', createdAt: '2026-10-24T08:00:00Z', updatedAt: '2026-10-24T08:00:00Z',
}))
const dramas: DramaListItem[] = ['逆风归来', '重逢之后', '藏在时光里的秘密', '心动倒计时', '迟来的告白'].map((title, index) => ({
  id: `900719925474099${index}`, title, coverUrl: '', status: index === 3 ? 'ongoing' : 'completed', year: 2026,
  tags: ['都市', '情感'], publishStatus: 'draft', episodeCount: 24 + index * 6, readyEpisodeCount: 24 + index * 6,
  createdByName: '内容运营', updatedByName: '示例管理员',
}))
let applicationId = applications[0].id
const loginPreview = new URLSearchParams(location.search).has('login')
const api = {
  hasSession: () => !loginPreview,
  getSession: () => loginPreview ? null : session,
  me: async () => session,
  login: async () => session,
  logout: async () => {},
  getApplicationId: () => applicationId,
  setApplicationId: (id: string) => { applicationId = id },
  listApplications: async () => applications,
  overview: async () => ({ dramaCount: dramas.length, episodeCount: 180, publishedCount: 0, pendingMediaCount: 0, mediaCleanupCount: 0 }),
  listDramas: async (query: DramaListQuery) => {
    const items = dramas.filter(drama => !query.query || drama.title.includes(query.query))
    return { items, total: items.length }
  },
  // 预览中的保存只更新内存，用于确认表单反馈，不发送运营接口请求。
  updateApplication: async (id: string, input: Partial<Application>) => ({ ...applications.find(app => app.id === id)!, ...input }),
} as unknown as OperationsApi
createRoot(document.getElementById('root')!).render(
  <ConfigProvider locale={zhCN} theme={consoleTheme}><OperationsConsole api={api} /></ConfigProvider>,
)
