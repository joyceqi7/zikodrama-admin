import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Empty, Flex, InputNumber, Space, Spin, Switch, Table, Tag, Typography } from 'antd'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { OperationsApi } from '../../api'
import type { RankingCategory, RankingItem, RankingView } from '../../categoryRankings'
import { reportOperationFailure } from '../../operationErrors'
import { toUserMessage } from '../../userMessage'

interface Props {
  channel?: 'official' | 'direct'
  // api 读写当前主体、当前渠道的推荐配置。
  api: OperationsApi
  // canUpdate 决定是否展示写操作，后端仍执行权限校验。
  canUpdate: boolean
  // notify 提示已成功持久化的操作。
  notify: (message: string, tone?: 'success' | 'error') => void
}

// CategoryRankingManagement 用官方标签切换独立榜单，英文名只用于展示。
export function CategoryRankingManagement(props: Props) {
  const [categories, setCategories] = useState<RankingCategory[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let current = true
    setLoading(true); setError('')
    props.api.rankingCategories().then(value => {
      if (current) { setCategories(value); setSelected(previous => value.some(item => item.tag.id === previous) ? previous : value.find(item => item.count > 0)?.tag.id ?? value[0]?.tag.id ?? '') }
    }).catch(reason => {
      reportOperationFailure('读取分类排行榜标签失败', reason)
      if (current) setError(toUserMessage(reason))
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [props.api, attempt])
  const updateCount = useCallback((count: number) => setCategories(current => current.map(item => item.tag.id === selected ? { ...item, count } : item)), [selected])
  const category = categories.find(item => item.tag.id === selected)
  return <Card ><Flex vertical gap={20}>
    <Flex justify="space-between" align="start" wrap gap={12}><div><Typography.Title level={3}>{props.channel === 'direct' ? '直连分类排行榜' : '官方分类排行榜'}</Typography.Title><Typography.Text type="secondary">当前主体、当前渠道已上线短剧按共享标签自动入榜，同主体小程序共享配置；标签数量包含隐藏项，隐藏后保留排名，可随时重新展示。</Typography.Text></div>
    <Button disabled={saving || loading} onClick={() => setAttempt(value => value + 1)}>刷新分类</Button></Flex>
    {error && <Alert type="error" showIcon title={error} action={<Button onClick={() => setAttempt(value => value + 1)}>重新加载</Button>} />}
    {loading ? <Spin aria-label="加载分类" /> : <>
      <Flex wrap gap={8} role="group" aria-label="TikTok 分类">
        {categories.map(({ tag, count }) => <Button type={tag.id === selected ? "primary" : "default"} key={tag.id} aria-label={`${tag.englishName || tag.officialName} ${count}`} aria-pressed={tag.id === selected} disabled={saving} onClick={() => setSelected(tag.id)} title={tag.officialName}>
          <span>{tag.englishName || tag.officialName}</span><Tag>{count}</Tag>
        </Button>)}
      </Flex>
      {category && <RankingEditor key={selected} {...props} tagId={selected} name={category.tag.englishName || category.tag.officialName} onSaving={setSaving} onSaved={updateCount} />}
      {!categories.length && !error && <Empty description="暂无可用的 TikTok 标签" />}
    </>}
  </Flex></Card>
}

interface EditorProps extends Props {
  // tagId 是不可变官方字符串标签标识。
  tagId: string
  // name 仅作当前分类提示。
  name: string
  // onSaving 在保存时锁定分类切换。
  onSaving: (saving: boolean) => void
  // onSaved 更新当前全部关联条目数。
  onSaved: (count: number) => void
}

function RankingEditor({ channel,api, tagId, name, canUpdate, notify, onSaving, onSaved }: EditorProps) {
  const [config, setConfig] = useState<RankingView>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const busy = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    let current = true
    setLoading(true); setError(''); setConfig(undefined)
    api.categoryRanking(tagId).then(value => { if (current) { setConfig(value); onSaved(value.items.length) } }).catch(reason => {
      reportOperationFailure('读取分类榜单失败', reason)
      if (current) setError(toUserMessage(reason))
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [api, tagId, attempt, onSaved])
  const save = async (items: RankingItem[]) => {
    if (!config || !canUpdate || busy.current || error) return false
    busy.current = true; setSaving(true); onSaving(true)
    try {
      const next = await api.saveCategoryRanking(tagId, { revision: config.revision, items })
      if (mounted.current) { setConfig(next); onSaved(next.items.length); notify('分类排行榜已保存') }
      return true
    } catch (reason) {
      reportOperationFailure('保存分类排行榜失败', reason)
      // 保存结果未知或版本冲突时要求重新读取，禁止继续覆盖旧版本。
      if (mounted.current) setError(toUserMessage(reason))
      return false
    } finally { busy.current = false; if (mounted.current) { setSaving(false); onSaving(false) } }
  }
  const allItems = config?.items ?? []
  const items = allItems
  const disabled = !canUpdate || saving || loading || !!error
  const move = (index: number, target: number) => {
    if (target < 0 || target >= items.length || target === index) return
    const next = [...items]; const [item] = next.splice(index, 1); next.splice(target, 0, item); void save(next)
  }
  const byId = new Map(config?.dramas.map(drama => [drama.id, drama]))
  const rows = items.map((item, index) => ({ ...item, index, drama: byId.get(item.dramaId) }))
  return <Flex vertical gap={16}>
    <Typography.Title level={4}>{name}</Typography.Title>
    {error && <Alert type="error" showIcon title={error} action={<Button disabled={saving} onClick={() => setAttempt(value => value + 1)}>重新加载</Button>} />}
    <Table rowKey="dramaId" loading={loading || saving} dataSource={rows} pagination={false} scroll={{ x: 820 }} locale={{ emptyText: '暂无已上线且属于此标签的短剧' }} columns={[
      { title: '排名', width: 75, render: (_, row) => <Tag color={row.index === 0 ? "gold" : row.index === 1 ? "default" : row.index === 2 ? "orange" : undefined}>{row.index + 1}</Tag> },
      { title: '封面', width: 112, render: (_, row) => row.drama?.coverUrl ? <img src={row.drama.coverUrl} alt="" width={80} height={60} /> : '—' },
      { title: '短剧', render: (_, row) => <Flex vertical gap={4}><Typography.Text strong>{row.drama?.title || `短剧 ${row.dramaId}`}</Typography.Text>{!row.drama && <Typography.Text type="warning">已下架或标签已变更，前台不展示</Typography.Text>}</Flex> },
      ...(channel==='direct'?[{title:'线上版本 / 应用',width:160,render:(_:unknown,row:typeof rows[number])=>{const metadata=config?.metadata?.[row.dramaId];return <Typography.Text type={metadata?.applications?'secondary':'warning'}>{metadata?`v${metadata.version} · ${metadata.applications} 个有效应用`:'无可用版本'}</Typography.Text>}}]:[]),
      { title: '排序', width: 160, render: (_, row) => <Space><RankInput rank={row.index + 1} max={items.length} disabled={disabled} onMove={rank => move(row.index, rank - 1)} /><Flex vertical><Button type="text" aria-label={`上移第 ${row.index + 1} 部`} icon={<ArrowUp size={16} />} disabled={disabled || row.index === 0} onClick={() => move(row.index, row.index - 1)} /><Button type="text" aria-label={`下移第 ${row.index + 1} 部`} icon={<ArrowDown size={16} />} disabled={disabled || row.index === items.length - 1} onClick={() => move(row.index, row.index + 1)} /></Flex></Space> },
      { title: '展示', width: 110, render: (_, row) => <Switch aria-label={`展示 ${row.drama?.title || row.dramaId}`} checkedChildren="展示" unCheckedChildren="隐藏" checked={row.visible} disabled={disabled} onChange={visible => void save(allItems.map(item => item.dramaId === row.dramaId ? { ...item, visible } : item))} /> },
    ]} />

  </Flex>
}

function RankInput({ rank, max, disabled, onMove }: { rank: number; max: number; disabled: boolean; onMove: (rank: number) => void }) {
  const [value, setValue] = useState<number | null>(rank)
  useEffect(() => { setValue(rank) }, [rank])
  const commit = () => {
    if (value !== null && Number.isInteger(value) && value >= 1 && value <= max) onMove(value)
    setValue(rank)
  }
  return <InputNumber aria-label={`第 ${rank} 部排序`} min={1} max={max} precision={0} value={value} disabled={disabled} onChange={setValue} onBlur={commit} onPressEnter={event => event.currentTarget.blur()} />
}
