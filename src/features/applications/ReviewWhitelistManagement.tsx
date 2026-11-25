import { Alert, Avatar, Button, Empty, Flex, Table, Tag, Typography } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { OperationsApi } from '../../api'
import type { ReviewWhitelist } from '../../applications'
import { PageHeader, PageStack } from '../../components/PageHeader'
import type { CarouselDrama } from '../../homepage'
import { reportOperationFailure } from '../../operationErrors'
import { DramaSelectionModal } from '../dramas/DramaSelectionModal'

interface Props {
  /** subjectId 固定本页所有请求的发布主体，不跟随应用选择器切换。 */
  subjectId: string
  /** channel 固定当前菜单对应的官方或直连发布渠道。 */
  channel: 'official' | 'direct'
  /** api 使用独立审核列表权限。 */
  api: OperationsApi
  /** canUpdate 决定是否可以修改清单。 */
  canUpdate: boolean
  /** notify 通过现有安全消息入口展示结果。 */
  notify(message: string, tone?: 'success' | 'error'): void
  /** onEditingStateChange 将保存状态交给后台外壳保护页面导航。 */
  onEditingStateChange?(dirty: boolean, saving: boolean): void
}

const limit = 100

function configuredDramas(config: ReviewWhitelist): CarouselDrama[] {
  const byId = new Map(config.dramas.map(drama => [drama.id, drama]))
  // 下架的引用仍保留在列表里，运营可以辨认并移除。
  return config.dramaIds.map(id => byId.get(id) ?? { id, title: '', coverUrl: '' })
}

/** ReviewWhitelistManagement 在官方或直连发布菜单维护当前主体渠道共享的审核列表。 */
export function ReviewWhitelistManagement({ subjectId, channel, api, canUpdate, notify, onEditingStateChange }: Props) {
  const [config, setConfig] = useState<ReviewWhitelist>()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerError, setPickerError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const generation = useRef<symbol>(Symbol())
  const busy = useRef(false)
  const rows = config ? configuredDramas(config) : []
  const loadTargets = useCallback((query: string, cursor: string) => api.reviewWhitelistTargets(channel, subjectId, query, cursor), [api, channel, subjectId])

  const load = useCallback(async () => {
    if (!subjectId) return
    const ticket = Symbol()
    generation.current = ticket
    setLoading(true)
    setFailed(false)
    try {
      const value = await api.getReviewWhitelist(channel, subjectId)
      if (ticket !== generation.current) return
      setConfig(value)
    } catch (error) {
      if (ticket !== generation.current) return
      setFailed(true)
      notify(reportOperationFailure('读取审核列表失败', error), 'error')
    } finally {
      if (ticket === generation.current) setLoading(false)
    }
  }, [api, subjectId, channel, notify])
  useEffect(() => {
    setConfig(undefined)
    setPickerOpen(false)
    setSaving(false)
    busy.current = false
    void load()
    return () => { generation.current = Symbol() }
  }, [load])
  useEffect(() => { onEditingStateChange?.(false, saving) }, [saving, onEditingStateChange])
  useEffect(() => () => onEditingStateChange?.(false, false), [onEditingStateChange])
  useEffect(() => {
    if (!saving) return
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [saving])

  const save = async (dramaIds: string[], action: 'add' | 'remove') => {
    if (!config || !canUpdate || loading || busy.current) return
    const ticket = generation.current
    busy.current = true
    setPickerError('')
    setSaving(true)
    try {
      const value = await api.saveReviewWhitelist(channel, subjectId, { revision: config.revision, dramaIds })
      if (ticket !== generation.current) return
      // 以服务端确认的清单和修订更新列表，失败时保留原列表及弹窗选择。
      setConfig(value)
      if (action === 'add') setPickerOpen(false)
      notify(action === 'add' ? '已添加到审核列表' : '已从审核列表移除', 'success')
    } catch (error) {
      if (ticket !== generation.current) return
      const message = reportOperationFailure(action === 'add' ? '添加审核短剧失败' : '移除审核短剧失败', error)
      if (action === 'add') setPickerError(message)
      else notify(message, 'error')
    } finally {
      if (ticket === generation.current) {
        busy.current = false
        setSaving(false)
      }
    }
  }

  if (!subjectId) return <Empty description="请先选择主体" />
  return <section aria-label="审核列表"><PageStack>
    <PageHeader id="review-whitelist-title" title="审核列表" eyebrow={`当前主体${channel === 'direct' ? '直连发布' : '官方发布'}共享的审核列表，按应用版本命中后生效。`} divider={false}
      actions={<>
        <Button disabled={saving} loading={loading} onClick={() => void load()}>重新加载</Button>
        {canUpdate && <Button type="primary" disabled={!config || loading || saving || rows.length >= limit}
          onClick={() => { setPickerError(''); setPickerOpen(true) }}>添加短剧</Button>}
      </>} />
    <Alert type="info" showIcon title="审核版本号和开关在「加白管理 → 审核开关」配置。" description="命中审核版本时，首页仅展示本列表，分类、轮播、热播和普通短剧列表全部隐藏。选中内容必须属于当前主体和发布渠道。" />
    {failed && <Alert type="error" showIcon title="清单读取失败，请重新加载。" />}
    <Typography.Text strong>已添加短剧（{rows.length}/{limit}）</Typography.Text>
    <Table<CarouselDrama> rowKey="id" loading={loading || saving} dataSource={rows} size="small"
      pagination={{ pageSize: 20, hideOnSinglePage: true, showSizeChanger: false }}
      locale={{ emptyText: '审核列表暂无短剧' }} columns={[
        { title: '短剧', key: 'drama', render: (_, drama) => <Flex align="center" gap="small">
          <Avatar shape="square" src={drama.coverUrl || undefined} />
          <Typography.Text style={{ overflowWrap: 'anywhere' }}>{drama.title || `不可用内容 ${drama.id}`}</Typography.Text>
          {!drama.title && <Tag color="warning">不可用</Tag>}
        </Flex> },
        ...(canUpdate ? [{ title: '操作', width: 76, key: 'actions', render: (_: unknown, drama: CarouselDrama) =>
          <Button size="small" danger type="text" aria-label={`移除 ${drama.title || drama.id}`} disabled={saving || loading}
            onClick={() => void save(rows.filter(row => row.id !== drama.id).map(row => row.id), 'remove')}>移除</Button> }] : []),
      ]} />
    {pickerOpen && canUpdate && <DramaSelectionModal title="添加审核短剧"
      configured={rows.map(drama => ({ ...drama, title: drama.title || `不可用内容 ${drama.id}` }))}
      capacity={limit - rows.length} loadTargets={loadTargets} submitting={saving} submitError={pickerError}
      onClose={() => setPickerOpen(false)}
      onConfirm={dramas => void save([...rows, ...dramas].map(drama => drama.id), 'add')} />}
  </PageStack></section>
}
