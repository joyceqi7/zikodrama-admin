import { useRef, useState } from 'react'
import { Alert, Form, Modal, Select, Typography } from 'antd'
import { canRetryReviewSubmission, retryReviewPriority } from './publicationContent'
import type { OperationsApi } from '../../api'
import type { DramaListItem, TikTokPublicationPriority } from '../../domain'
import { catalogActionLabel, type CatalogAction } from './catalogActions'
import { reportDramaFailure } from './dramaEditorErrors'

interface CatalogActionDialogProps {
  /** api 复用后台受鉴权的官方发布接口。 */
  api: OperationsApi
  /** drama 是点击操作时的目录快照，服务端仍校验最新状态。 */
  drama: DramaListItem
  /** action 是当前确认的状态流动作。 */
  action: CatalogAction
  /** onClose 返回列表，执行期间不可关闭以免重复提交。 */
  onClose: () => void
  /** onChanged 在操作完成后刷新最新目录事实。 */
  onChanged: () => void
}

/** CatalogActionDialog 在列表内确认状态变更；失败保留输入并展示统一提示。 */
export function CatalogActionDialog({ api, drama, action, onClose, onChanged }: CatalogActionDialogProps) {
  const [priority, setPriority] = useState<TikTokPublicationPriority>(() => drama.publication && canRetryReviewSubmission(drama.publication) ? retryReviewPriority(drama.publication) : 'normal')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(false)
  const retryReview = action === 'retry' && canRetryReviewSubmission(drama.publication)
  const label = retryReview ? '重新提交送审' : catalogActionLabel(action, drama)
  const confirm = async () => {
    if (active.current) return
    active.current = true
    setBusy(true)
    setError('')
    try {
      if (action === 'submit') await api.submitTikTokPublication(drama.id)
      else if (action === 'submit_review') await api.submitTikTokReview(drama.id, { priority })
      else if (action === 'publish') {
        // 重新读取状态并核对列表所见任务，不能把确认静默转移到新版本。
        const current = await api.findTikTokPublication(drama.id)
        if (current.status !== 'approved' || !drama.publication?.id || current.id !== drama.publication.id) {
          console.warn('catalog publication state changed', { error: 'Latest publication is not approved' })
          setError('审核状态已变化，请刷新列表后再操作。')
          onChanged()
          return
        }
        await api.publishTikTokPublication(drama.id, current.id)
      } else if (action === 'withdraw') {
        if (!api.withdrawTikTokReview) throw new Error('Review withdrawal API is unavailable')
        await api.withdrawTikTokReview(drama.id)
      } else if (action === 'retry') {
        if (retryReview) await api.retryTikTokPublication(drama.id, { priority })
        else await api.retryTikTokPublication(drama.id)
      }
      else await api.refreshTikTokReview(drama.id)
      onChanged()
      onClose()
    } catch (reason) {
      setError(reportDramaFailure(`catalog publication ${action} failed`, reason))
    } finally {
      active.current = false
      setBusy(false)
    }
  }
  return <Modal open title={`${label} · ${drama.title}`} okText={`确认${label}`} cancelText="取消" confirmLoading={busy}
    okButtonProps={{ 'aria-label': `确认${label}`, disabled: busy }} closable={!busy} maskClosable={!busy} keyboard={!busy} cancelButtonProps={{ disabled: busy }}
    onCancel={onClose} onOk={() => void confirm()}>
    <Typography.Paragraph>{retryReview ? '重新选择审核优先级并提交已同步的内容，无需重新同步。审核通过后仍需确认上线。' : action === 'submit' ? '将当前就绪内容冻结为版本并同步到 TikTok，未确认草稿不能同步。同步完成后，再选择审核优先级提交送审；已有线上版本会继续播放。' : action === 'submit_review' ? '将已同步的 TikTok 版本提交审核。审核通过后仍需确认上线。' : action === 'publish' ? '将最新审核通过的版本上线，观众将看到这个版本的内容。上线后还需选择目标应用并确认分发。' : action === 'withdraw' ? '撤回当前审核后可修改内容并重新同步，已有线上版本不受影响。' : action === 'review' ? '从 TikTok 查询本次审核的最新结果，审核通过后仍需确认上线。' : '检查当前同步任务并重试未完成的处理。'}</Typography.Paragraph>
    {(action === 'submit_review' || retryReview) && <Form layout="vertical"><Form.Item label="审核优先级"><Select aria-label="审核优先级" value={priority} disabled={busy} onChange={setPriority} options={[{ value: 'normal', label: '普通审核' }, { value: 'urgent', label: '加急审核' }]} /></Form.Item></Form>}
    {drama.publication?.errorCode === 'urgent_review_quota_exceeded' && <Alert type="warning" showIcon title="组织今日加急审核额度已用完" description="请选择普通审核重新提交，或等待加急额度恢复后再试。" />}
    {error && <Alert type="error" showIcon title={error} />}
  </Modal>
}
