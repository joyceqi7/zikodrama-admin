/** 投放链接按钮的两渠道示例，使用模拟数据检查桌面与移动端，不访问业务或平台服务。 */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, ConfigProvider, Flex } from 'antd'
import 'antd/dist/reset.css'
import '../../src/theme.css'
import type { OperationsApi } from '../../src/api'
import type { Application, DramaListItem } from '../../src/domain'
import { Dashboard } from '../../src/features/dramas/Dashboard'
import { OfficialPublicationManagement } from '../../src/features/dramas/OfficialPublicationManagement'

const applications = [
  { id: '101', name: '官方应用', playbackProvider: 'tiktok_minis' },
  { id: '102', name: '直连应用', playbackProvider: 'byteplus_web' },
] as Application[]
const base: DramaListItem = {
  id: '33', title: '已直连上线 · TikTok 未同步', coverUrl: '', tags: [], status: 'updating', year: 2026,
  publishStatus: 'draft', episodeCount: 3, readyEpisodeCount: 3,
  directPublication: { status: 'published', version: 1, revision: 1, pendingChanges: false, enabledApplications: 1 },
}
const dramas: DramaListItem[] = [base, {
  ...base, id: '34', title: '直连已下线 · 官方已上线', onlineVersion: 7,
  officialRelease: { selectedPublicationId: '704', status: 'online', version: 7 },
  directPublication: { ...base.directPublication!, status: 'offline' },
}]
const api = {
  listDramas: async () => ({ items: dramas, total: dramas.length }),
  ensureDramaCampaign: async () => ({ landingUrl: 'https://www.tiktok.com/minis/mock-link' }),
} as unknown as OperationsApi

/** CampaignLinkPreview 保留生产组件的通道判断与响应式布局，切换应用不修改任何业务配置。 */
export function CampaignLinkPreview() {
  const [applicationId, setApplicationId] = useState('102')
  const [officialPage, setOfficialPage] = useState(true)
  const [notice, setNotice] = useState('')
  const app = applications.find(item => item.id === applicationId)!
  return <ConfigProvider theme={{ token: { motion: false } }}>
    <main style={{ padding: 16 }}>
      <h1>投放链接按钮界面检查</h1>
      <p>以下为模拟数据，点击不会访问真实 TikTok。直连已上线即可生成链接，官方应用仍要求官方上线。</p>
      <Flex gap={12} wrap style={{ marginBottom: 16 }}>
        <label>目标应用 <select aria-label="目标应用" value={applicationId} onChange={event => setApplicationId(event.target.value)}>
          {applications.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <Button onClick={() => setOfficialPage(true)}>查看官方发布列表</Button>
        <Button onClick={() => setOfficialPage(false)}>查看短剧管理列表</Button>
      </Flex>
      {officialPage ? <OfficialPublicationManagement api={api} applications={applications} applicationId={applicationId} canCopyCampaign notify={setNotice} />
        : <Dashboard api={api} applicationId={applicationId} applicationProvider={app.playbackProvider} dramas={dramas}
          query={{ page: 1, pageSize: 20 }} total={dramas.length} onQueryChange={() => {}} loading={false} canCreate={false}
          onCreate={() => {}} onRefresh={() => {}} onSelect={() => {}} can={code => code === 'operations.campaign.create'} notify={setNotice} />}
      <p role="status">{notice}</p>
    </main>
  </ConfigProvider>
}

createRoot(document.getElementById('root')!).render(<CampaignLinkPreview />)
