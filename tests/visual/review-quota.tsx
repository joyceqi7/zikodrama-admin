/** 使用真实组件和测试替身检查额度提示与重选交互，不连接官方服务。 */
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Alert, Button, ConfigProvider } from 'antd'
import 'antd/dist/reset.css'
import '../../src/theme.css'
import type { OperationsApi } from '../../src/api'
import type { Drama, DramaListItem, TikTokPublication, TikTokPublicationInput } from '../../src/domain'
import { PublicationPage } from '../../src/features/dramas/PublicationPage'
import { CatalogActionDialog } from '../../src/features/dramas/CatalogActionDialog'
const publication: TikTokPublication = { id: '112', dramaId: '170', ownerApplicationId: '101', priority: 'urgent', status: 'failed', stage: 'submit_review', reviewStatus: 0, platformPublishStatus: 0, errorCode: 'urgent_review_quota_exceeded', attempts: 1, nextAttemptAt: '', createdAt: '', updatedAt: '' }
const drama: Drama = { id: '170', title: '测试短剧', description: '', coverUrl: '', tags: [], tagIds: [], status: 'completed', publishStatus: 'publishing', episodes: [] }
/** Preview 复用生产工作台与列表弹窗，所有操作只写测试提示。 */
export function Preview() {
 const [message, setMessage] = useState('')
 const [dialog, setDialog] = useState(false)
 const api = useMemo(() => { let current = publication; return ({ findTikTokPublication: async () => current, retryTikTokPublication: async (_id: string, input?: TikTokPublicationInput) => { setMessage(`已选择${input?.priority === 'normal' ? '普通' : '加急'}审核重新提交`); current = { ...publication, priority: input?.priority ?? publication.priority, status: 'queued', errorCode: '' }; return current }, listDramaDistributions: async () => [] } as unknown as OperationsApi) }, [])
 return <main style={{ padding: 16 }}><Button onClick={() => setDialog(true)}>检查列表重试弹窗</Button>{message && <Alert type="success" title={message} />}
 <PublicationPage api={api} drama={drama} applications={[]} open canSubmit canSync={false} canRelease={false} canDistribute={false} onClose={() => {}} onChanged={() => {}} notify={() => {}} />
 {dialog && <CatalogActionDialog api={api} drama={{ ...drama, publication } as unknown as DramaListItem} action="retry" onClose={() => setDialog(false)} onChanged={() => {}} />}</main>
}
createRoot(document.getElementById('root')!).render(<ConfigProvider theme={{ token: { motion: false } }}><Preview /></ConfigProvider>)
