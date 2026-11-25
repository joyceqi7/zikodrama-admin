import { useEffect, useRef, useState } from 'react'
import type { OperationsApi } from '../../api'
import type { DramaListItem } from '../../domain'
import type { DirectCommand, DirectOperation, DirectWorkbench } from '../../directPlayback'
import { reportOperationFailure } from '../../operationErrors'

/** useDirectPublicationActions 把直连同步发布收回内容列表，重试未知结果时复用原请求键。 */
export function useDirectPublicationActions(api: OperationsApi, refresh: () => void, notify: (message: string, tone?: 'success' | 'error') => void) {
  const [busyId, setBusyId] = useState('')
  const [batchProgress, setBatchProgress] = useState<{ completed: number; total: number }>()
  const submitting = useRef(false)
  const active = useRef(false)
  const pending = useRef(new Map<string, { signature: string; command: DirectCommand }>())
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const submit = async (row: DramaListItem, kind: DirectCommand['kind']) => {
    if (!api.directRequest) throw new Error('Direct publication API is unavailable')
    if (!active.current) return false
    const subjectId = api.getSubjectId()
    // 新服务提供发布修订；旧列表缺少摘要时按需读取，不将未读状态当成修订零。
    const revision = row.directPublication?.revision ?? (await api.directRequest<DirectWorkbench>(`/admin/v1/direct/dramas/${encodeURIComponent(row.id)}/publication`)).publication.revision
    // 读取修订后重新检查主体与挂载状态，阻止切换后继续发送旧列表的发布命令。
    if (!active.current || api.getSubjectId() !== subjectId) return false
    const signature = JSON.stringify([subjectId, kind, revision])
    let saved = pending.current.get(row.id)
    if (saved?.signature !== signature) {
      saved = { signature, command: { kind, expectedRevision: revision, requestId: crypto.randomUUID?.() || `direct-${Date.now()}-${Math.random().toString(16).slice(2)}` } }
      pending.current.set(row.id, saved)
    }
    await api.directRequest<DirectOperation>(`/admin/v1/direct/dramas/${encodeURIComponent(row.id)}/publication/operations`, { method: 'POST', body: JSON.stringify(saved.command) })
    pending.current.delete(row.id)
    return true
  }
  const publish = async (row: DramaListItem, kind: DirectCommand['kind']) => {
    if (submitting.current) return
    submitting.current = true; setBusyId(row.id)
    try {
      if (!await submit(row, kind)) return
      if (active.current) {
        notify(kind === 'offline' ? '已下线' : kind === 'relist' ? `已重新上线 V${row.directPublication?.version}` : '已上线，同主体直连应用共用', 'success')
        refresh()
      }
    } catch (error) {
      const message = reportOperationFailure('修改直连上线状态失败', error)
      if (active.current) notify(message, 'error')
    } finally { submitting.current = false; if (active.current) setBusyId('') }
  }
  const batchPublish = async (rows: DramaListItem[]): Promise<string[]> => {
    if (submitting.current || !rows.length) return rows.map(row => row.id)
    submitting.current = true; setBatchProgress({ completed: 0, total: rows.length })
    const subjectId = api.getSubjectId()
    const failed: string[] = []
    let succeeded = 0
    let failureMessage = ''
    try {
      for (const row of rows) {
        if (!active.current || api.getSubjectId() !== subjectId) { failed.push(row.id); continue }
        setBusyId(row.id)
        try { if (await submit(row, 'publish')) succeeded++; else failed.push(row.id) }
        catch (error) { failed.push(row.id); failureMessage = reportOperationFailure(`批量上线短剧失败（短剧 ${row.id}）`, error) }
        if (active.current) setBatchProgress(value => value ? { ...value, completed: value.completed + 1 } : value)
      }
      if (active.current) {
        notify(failed.length ? `已上线 ${succeeded} 部，${failed.length} 部失败；${failureMessage}，失败项可重试` : `已上线 ${succeeded} 部短剧，同主体直连应用共用`, failed.length ? 'error' : 'success')
        refresh()
      }
      return failed
    } finally { submitting.current = false; if (active.current) { setBusyId(''); setBatchProgress(undefined) } }
  }
  return { busyId, batchProgress, publish, batchPublish }
}
