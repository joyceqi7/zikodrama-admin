import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Empty, Flex, Popconfirm, Space, Spin, Tag, Typography } from 'antd'
import type { DramaDistribution, OperationsApi } from '../../api'
import type { DistributionApplication } from '../../applications'
import { reportDramaFailure } from './dramaEditorErrors'

interface Props {
  /** 读取授权事实并在请求内确认授权或撤权的接口。 */
  api: OperationsApi
  /** 当前短剧身份，切换短剧时重新加载授权关系。 */
  dramaId: string
  /** 官方线上版本的拥有方，初次授权没有关系行时仍须排除重复授权。 */
  ownerApplicationId?: string
  /** 应用目录提供候选目标，不能依赖已存在的授权关系生成候选。 */
  applications: DistributionApplication[]
  /** 精确分发权限；只读时仅展示已有授权事实。 */
  canUpdate: boolean
  /** 保存后刷新列表中的授权数量。 */
  onChanged: () => Promise<boolean | void> | boolean | void
}
const labels: Record<string, string> = { pending: '处理中', authorized: '已授权', revoked: '未分发', failed: '授权失败', attention_required: '需人工处理' }
const errorLabels: Record<string, string> = { platform_authorization_failed: 'TikTok 授权调用失败', retry_exhausted: '自动重试已达上限，请检查配置后人工恢复' }

// DramaDistributionPanel 由运营显式选择分发目标，并展示每个应用的可用条件与重试进度。
export function DramaDistributionPanel({ api, dramaId, ownerApplicationId, applications, canUpdate, onChanged }: Props) {
  const mounted = useRef(true)
  const [records, setRecords] = useState<DramaDistribution[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [outcomes, setOutcomes] = useState<Record<string, string>>({})
  const load = useCallback(async (resetSelection = false) => {
    setLoading(true)
    try {
      const next = await api.listDramaDistributions(dramaId)
      if (!mounted.current) return
      setRecords(next); setLoaded(true); setError('')
      if (resetSelection) setSelected(next.filter(row => row.enabled && row.applicationId !== row.ownerApplicationId).map(row => row.applicationId))
    } catch (cause) {
      const message = reportDramaFailure('load drama distributions failed', cause)
      if (mounted.current) setError(message)
    }
    finally { if (mounted.current) setLoading(false) }
  }, [api, dramaId])
  useEffect(() => {
    mounted.current = true; setRecords([]); setLoaded(false); setSelected([]); setError(''); void load(true)
    return () => { mounted.current = false }
  }, [load])
  const applicationById = useMemo(() => new Map(applications.map(app => [app.id, app])), [applications])
  const rows = useMemo(() => {
    if (!loaded) return []
    const ownerId = ownerApplicationId || records.find(row => row.ownerApplicationId)?.ownerApplicationId || ''
    // 授权绑定应用身份，可提前授予当前独立播放器应用；不切换通道、不自动授权。
    const merged = new Map(records.map(row => [row.applicationId, row]))
    if (canUpdate) {
      for (const app of applications) {
        if (app.id === ownerId || merged.has(app.id)) continue
        merged.set(app.id, { dramaId, applicationId: app.id, ownerApplicationId: ownerId, enabled: false, desiredAuthorized: false, status: 'revoked', attempts: 0, errorCode: '', nextAttemptAt: '' })
      }
    }
    return [...merged.values()]
  }, [loaded, ownerApplicationId, records, canUpdate, applications, dramaId])
  const pending = rows.some(row => row.status === 'pending')
  const failedRetryAt = rows
    .filter(row => row.status === 'failed' && row.nextAttemptAt)
    .map(row => Date.parse(row.nextAttemptAt))
    .filter(Number.isFinite)
    .sort((left, right) => left - right)[0]
  const refreshDelay = pending ? 5000 : failedRetryAt
    ? Math.max(5000, Math.min(60_000, failedRetryAt - Date.now() + 10_000))
    : 0
  useEffect(() => {
    if (!refreshDelay) return
    let active = true
    const timer = window.setTimeout(async () => {
      await load(false)
      if (!active) return
    }, refreshDelay)
    return () => { active = false; window.clearTimeout(timer) }
  }, [load, refreshDelay])
  const targets = useMemo(() => rows.filter(row => row.applicationId !== row.ownerApplicationId), [rows])
  // 全选仅覆盖与逐项勾选相同的可用目标，避免误撤销已停用或缺少配置的应用。
  const selectableIds = targets.filter(row => {
    const app = applicationById.get(row.applicationId)
    return (app?.clientKeyConfigured ?? Boolean(app?.clientKey)) && app?.status === 'active'
  }).map(row => row.applicationId)
  const selectableSet = new Set(selectableIds)
  const selectedSelectableCount = selectableIds.filter(id => selected.includes(id)).length
  const authorized = targets.filter(row => selected.includes(row.applicationId) && row.status === 'authorized').length
  const selectedCount = targets.filter(row => selected.includes(row.applicationId)).length
  const dirty = targets.some(row => row.enabled !== selected.includes(row.applicationId))
  const selectedTargets = targets.filter(row => selected.includes(row.applicationId))
  const saveSelection = async () => {
    if (!dirty || working || loading || error) return
    setWorking(true); setError(''); setOutcomes({})
    try {
      const changed = targets.filter(row => row.enabled !== selected.includes(row.applicationId))
      const results = await Promise.allSettled(changed.map(row => api.setDramaDistribution(dramaId, row.applicationId, selected.includes(row.applicationId))))
      const nextOutcomes: Record<string, string> = {}
      results.forEach((result, index) => { nextOutcomes[changed[index].applicationId] = result.status === 'fulfilled' ? '已提交' : reportDramaFailure('update drama distribution failed', result.reason) })
      setOutcomes(nextOutcomes)
      const failed = results.filter(result => result.status === 'rejected').length
      await onChanged(); await load(failed === 0)
      if (failed) setError(`${changed.length - failed} 个应用已提交，${failed} 个失败；可修复后再次确认。`)
    } catch (cause) { if (mounted.current) setError(reportDramaFailure('update drama distribution failed', cause)) }
    finally { if (mounted.current) setWorking(false) }
  }
  const retry = async (row: DramaDistribution) => {
    setWorking(true); setError('')
    try { await api.setDramaDistribution(dramaId, row.applicationId, true); await load(true) }
    catch (cause) { if (mounted.current) setError(reportDramaFailure('retry drama distribution failed', cause)) }
    finally { if (mounted.current) setWorking(false) }
  }
  return <section data-ui="distribution-panel" aria-label="应用分发">
    <header data-ui="distribution-header">
      <div>
        <Typography.Title level={5}>选择分发应用</Typography.Title>
        <Typography.Paragraph type="secondary">拥有方随官方线上版本自动可用；其他应用可提前授权，保存后按实际平台结果确认，使用官方播放器时生效。</Typography.Paragraph>
      </div>
      <Space wrap>
        <Tag color={targets.some(row => ['failed', 'attention_required'].includes(row.status)) ? 'red' : 'green'}>已授权 {authorized}/{selectedCount}</Tag>
        <Button size="small" onClick={() => void load(true)} disabled={working || loading}>刷新状态</Button>
        {canUpdate && <Popconfirm title="保存当前分发设置？" description={`将向 ${selectedTargets.length} 个应用开放当前短剧，未勾选的应用会撤销授权。`} okText="保存设置" cancelText="取消" onConfirm={saveSelection}>
          <Button type="primary" disabled={!dirty || working || loading || Boolean(error)} loading={working}>保存分发设置</Button>
        </Popconfirm>}
      </Space>
    </header>
    {error && <Alert type="error" title={error} showIcon />}
    {loading && <Flex align="center" gap={8}><Spin size="small" /><Typography.Text type="secondary">正在加载授权状态</Typography.Text></Flex>}
    {!loading && !targets.length && !error && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前主体暂无其他可分发应用" />}
    {canUpdate && targets.length > 0 && <div data-ui="distribution-select-all">
      <Checkbox checked={selectableIds.length > 0 && selectedSelectableCount === selectableIds.length} indeterminate={selectedSelectableCount > 0 && selectedSelectableCount < selectableIds.length} disabled={working || loading || Boolean(error) || selectableIds.length === 0} onChange={event => setSelected(current => event.target.checked ? [...new Set([...current, ...selectableIds])] : current.filter(id => !selectableSet.has(id)))}>全选可用应用</Checkbox>
      <Typography.Text type="secondary">已选 {selectedSelectableCount}/{selectableIds.length}</Typography.Text>
    </div>}
    <div data-ui="distribution-list" role="list">{rows.map(row => {
      const app = applicationById.get(row.applicationId)
      const owner = row.applicationId === row.ownerApplicationId
      const configured = selectableSet.has(row.applicationId)
      const showAttempts = !owner && (row.attempts > 0 || ['pending', 'failed', 'attention_required'].includes(row.status))
      return <div key={row.applicationId} data-ui="distribution-row" data-selected={owner || selected.includes(row.applicationId)} role="listitem"><Flex justify="space-between" align="flex-start" wrap gap={12}>
        <Space align="start">{!owner && <Checkbox aria-label={`选择 ${app?.name ?? row.applicationId}`} checked={selected.includes(row.applicationId)} disabled={!canUpdate || !configured || working || loading || Boolean(error)} onChange={event => setSelected(current => event.target.checked ? [...new Set([...current, row.applicationId])] : current.filter(id => id !== row.applicationId))} />}<Space orientation="vertical" size={3}>
          <Space wrap><Typography.Text strong>{app?.name ?? row.applicationId}</Typography.Text>{owner && <Tag color="blue">内容拥有方</Tag>}{app?.playbackProvider === 'byteplus_web' && <Tag>独立播放器 · 可预授权</Tag>}<Tag color={row.status === 'authorized' ? 'green' : ['failed', 'attention_required'].includes(row.status) ? 'red' : undefined}>{labels[row.status]}</Tag></Space>
          <Typography.Text type="secondary">{owner ? '线上后自动可用，无需重复授权' : `App ID：${app?.tiktokAppId ?? '未知'} · ${configured ? '配置可用' : app?.status !== 'active' ? '应用已停用' : '缺少 Client Key'}`}</Typography.Text>
          {showAttempts && <Typography.Text type="secondary">已尝试 {row.attempts} 次{row.nextAttemptAt && row.status === 'failed' ? ` · 下次重试 ${new Date(row.nextAttemptAt).toLocaleString('zh-CN', { hour12: false })}` : ''}</Typography.Text>}
          {row.errorCode && <Typography.Text type="danger">{errorLabels[row.errorCode] ?? row.errorCode}</Typography.Text>}
          {outcomes[row.applicationId] && <Typography.Text type={outcomes[row.applicationId] === '已提交' ? 'success' : 'danger'}>本次操作：{outcomes[row.applicationId]}</Typography.Text>}
        </Space></Space>
        {canUpdate && !owner && ['failed', 'attention_required'].includes(row.status) && row.enabled && <Button size="small" disabled={working} onClick={() => void retry(row)}>人工恢复</Button>}
        {canUpdate && !owner && selected.includes(row.applicationId) && <Button size="small" disabled={working} onClick={() => setSelected(current => current.filter(id => id !== row.applicationId))}>取消选择</Button>}
      </Flex></div>
    })}</div>
  </section>
}
