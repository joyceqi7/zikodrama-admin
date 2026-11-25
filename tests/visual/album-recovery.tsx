/** 同步恢复的桌面及移动端验收入口；全部为本地替身，不访问业务或平台服务。 */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import 'antd/dist/reset.css'
import '../../src/theme.css'
import { ApiError, type OperationsApi } from '../../src/api'
import type { DramaListItem, TikTokPublication } from '../../src/domain'
import { OfficialPublicationManagement } from '../../src/features/dramas/OfficialPublicationManagement'

const tasks: Record<string, TikTokPublication> = {
  '310': {
    id: '339', dramaId: '310', ownerApplicationId: '1', priority: 'normal', currentContentChanged: false,
    status: 'failed', stage: 'update_album', reviewStatus: 3, platformPublishStatus: 0,
    errorCode: 'external_write_uncertain', platformAlbumId: '100', platformVersion: 1,
    attempts: 1, nextAttemptAt: '', createdAt: '', updatedAt: '',
  },
  '311': {
    id: '340', dramaId: '311', ownerApplicationId: '1', priority: 'normal', currentContentChanged: false,
    status: 'failed', stage: 'update_album', reviewStatus: 0, platformPublishStatus: 0,
    errorCode: 'external_write_uncertain', platformAlbumId: '101', platformVersion: 0,
    attempts: 1, nextAttemptAt: '', createdAt: '', updatedAt: '',
  },
}
const rows: DramaListItem[] = [
  { id: '310', title: 'She Is Forced to Kneel When the Duke Makes His Return', status: 'updating', year: 2026,
    coverUrl: '', tags: [], publishStatus: 'draft', episodeCount: 28, readyEpisodeCount: 28 },
  { id: '311', title: '首次同步待核对', status: 'updating', year: 2026,
    coverUrl: '', tags: [], publishStatus: 'draft', episodeCount: 5, readyEpisodeCount: 5 },
]
const api = {
  listDramas: async () => ({ items: rows.map(row => ({ ...row, publication: tasks[row.id] })), total: rows.length }),
  findTikTokPublication: async (id: string) => tasks[id],
  retryTikTokPublication: async (id: string) => {
    if (id === '311') throw new ApiError('test platform response', 409, 'album_update_unconfirmed')
    tasks[id] = { ...tasks[id], status: 'synced', stage: 'await_submit_review', reviewStatus: 0,
      platformVersion: 2, errorCode: undefined }
    return tasks[id]
  },
} as unknown as OperationsApi

/** AlbumRecoveryPreview 沿用真实列表与确认弹窗，分别展示受版本保护的恢复与首次同步只读核对。 */
export function AlbumRecoveryPreview() {
  const [notice, setNotice] = useState('')
  return <ConfigProvider theme={{ token: { motion: false } }}>
    <main style={{ padding: 16 }}>
      <h1>同步恢复界面检查</h1>
      <p>模拟任务：已有 V1 时恢复冻结内容；首次同步 V0 仍只核对。</p>
      <OfficialPublicationManagement api={api} applications={[]} canSync canReview notify={setNotice} />
      <p role="status">{notice}</p>
    </main>
  </ConfigProvider>
}

createRoot(document.getElementById('root')!).render(<AlbumRecoveryPreview />)
