import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Flex, Input, InputNumber, Modal, Form, Switch, Space, Table, Typography } from 'antd'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { OperationsApi } from '../../api'
import type { CarouselDrama, CarouselItem, CarouselView } from '../../homepage'
import { reportOperationFailure } from '../../operationErrors'
import { DramaSelectionModal } from './DramaSelectionModal'

interface CarouselManagementProps {
  // kind 区分独立权限与存储的轮播和人工热播。
  kind?: 'carousel' | 'hot'
  // channel 决定页面提示和固定的发布渠道。
  channel?: 'official' | 'direct'
  // api 读写当前主体、当前渠道的推荐配置。
  api: OperationsApi
  // canUpdate 控制配置操作；服务端仍按精确操作权限鉴权。
  canUpdate: boolean
  // notify 展示经过统一映射的保存结果。
  notify: (message: string, tone?: 'success' | 'error') => void
}

// CarouselManagement 复用轮播和人工热播的编辑交互，按独立接口整体保存，线上封面随剧目更新。
export function CarouselManagement({ kind = 'carousel', channel = 'official', api, canUpdate, notify }: CarouselManagementProps) {
  const isHot = kind === 'hot'
  const label = (channel === 'direct' ? '直连' : '') + (isHot ? '热播' : '轮播')
  const limit = isHot ? 15 : 20
  const [config, setConfig] = useState<CarouselView>()
  const [selected, setSelected] = useState<CarouselDrama>()
  const [editing, setEditing] = useState<number>()
  const [title, setTitle] = useState('')
  const [visible, setVisible] = useState(true)
  const [picker, setPicker] = useState<'add' | 'replace'>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const busy = useRef(false)
  const loadTargets = useCallback((query: string, cursor: string) => isHot ? api.hotDramaTargets(query, cursor) : api.carouselTargets(query, cursor), [api, isHot])

  useEffect(() => {
    let current = true
    setLoading(true); setError('')
    ;(isHot ? api.getHotDramas() : api.getCarousel()).then(value => { if (current) setConfig(value) }).catch(reason => {
      if (current) setError(reportOperationFailure(`读取${label}配置失败`, reason))
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [api, attempt, isHot, label])

  const save = async (items: CarouselItem[]) => {
    if (!config || !canUpdate || loading || busy.current) return
    busy.current = true; setSaving(true); setError('')
    try {
      const input = { revision: config.revision, dramaIds: items.map(item => item.dramaId), items }
      const next = await (isHot ? api.saveHotDramas(input) : api.saveCarousel(input))
      setConfig(next); notify(`${label}已保存`); return true
    } catch (reason) {
      setError(reportOperationFailure(`保存${label}配置失败`, reason))
    } finally { busy.current = false; setSaving(false) }
  }
  const items: CarouselItem[] = config?.items ?? (config?.dramaIds ?? []).map(dramaId => ({ dramaId, title: '', visible: true, createdAt: '' }))
  const move = (index: number, target: number) => {
    if (target < 0 || target >= items.length || index === target) return
    const next = [...items]; const [item] = next.splice(index, 1); next.splice(target, 0, item); void save(next)
  }
  const byId = new Map(config?.dramas.map(drama => [drama.id, drama]))
  const rows = items.map((item, index) => ({ ...item, index, drama: byId.get(item.dramaId) }))
  const configuredDramas = rows.map(row => row.drama ?? { id: row.dramaId, title: row.title || `不可用短剧 ${row.dramaId}`, coverUrl: '' })
  const openEditor = (index: number) => {
    const item = items[index]
    setEditing(index)
    setSelected(configuredDramas[index])
    setTitle(item.title)
    setVisible(item.visible)
    setError('')
  }
  const submit = async () => {
    if (editing === undefined || !selected) return
    const next = items.map((item, index) => index === editing ? { ...item, dramaId: selected.id, title: title.trim(), visible } : item)
    if (await save(next)) setEditing(undefined)
  }
  const addDramas = async (dramas: CarouselDrama[]) => {
    // 批量追加保留原有顺序与栏目配置，新短剧默认展示线上标题和封面。
    const additions = dramas.map(drama => ({ dramaId: drama.id, title: '', visible: true, createdAt: '' }))
    if (await save([...items, ...additions])) setPicker(undefined)
  }

  return <Card>
    <Flex vertical gap={20}>
      <Flex justify="space-between" align="flex-start" wrap gap={16}>
        <div><Typography.Title level={3}>{channel==='direct' ? (isHot?'直连首页热播':'直连首页轮播') : (isHot ? '首页热播短剧' : '首页轮播管理')}</Typography.Title>
          <Typography.Text type="secondary">{isHot ? '配置 TikTok Minis 首页热播短剧，建议 8–12 部，最多 15 部' : '配置 TikTok Minis 首页轮播推荐短剧，建议 6–8 张'}</Typography.Text></div>
        <Space wrap>{canUpdate && <Button type="primary" icon={<Plus size={16} />} disabled={!config || saving || loading || items.length >= limit} onClick={() => { setError(''); setPicker('add') }}>添加{label}</Button>}</Space>
      </Flex>
      <Typography.Text type="secondary">{channel==='direct'?'同主体直连小程序共享此配置；前台仅展示该主体已上架的直连版本。':'同主体官方小程序共享此配置；前台仅展示当前小程序已获授权的上线短剧。'}</Typography.Text>
      <Alert type="info" showIcon title={isHot ? "热播短剧按人工排序展示，隐藏后不在前台展示。建议保持 8–12 部。" : "轮播图按排序值从小到大展示，点击上移/下移可调整顺序。建议保持 6–8 张高质量短剧。"} />
      {error && <Alert type="error" showIcon title={error} action={<Button disabled={saving} onClick={() => setAttempt(value => value + 1)}>重新加载</Button>} />}
      <Table rowKey="dramaId" loading={loading || saving} dataSource={rows} pagination={false} scroll={{ x: 1050 }} locale={{ emptyText: `尚未配置${label}，点击添加${label}开始配置。` }} columns={[
        ...(isHot ? [{ title: '#', width: 65, render: (_: unknown, row: typeof rows[number]) => <Typography.Text strong>{row.index + 1}</Typography.Text> }] : []),
        { title: '封面', width: 110, render: (_, row) => row.drama?.coverUrl ? <img src={row.drama.coverUrl} alt="" width={80} height={60} /> : '—' },
        { title: isHot ? '短剧' : '标题 / 描述', render: (_, row) => <Flex vertical gap={4}><Typography.Text strong>{row.title || row.drama?.title || `短剧 ${row.dramaId}`}</Typography.Text><Typography.Text type="secondary">关联短剧：{row.drama?.title || row.dramaId}</Typography.Text>{!row.drama && <Typography.Text type="warning">已下架，前台不展示</Typography.Text>}</Flex> },
        ...(channel==='direct'?[{title:'线上版本 / 应用',width:150,render:(_:unknown,row:typeof rows[number])=>{const metadata=config?.metadata?.[row.dramaId];return <Typography.Text type={metadata?.applications?'secondary':'warning'}>{metadata?`v${metadata.version} · ${metadata.applications} 个有效应用`:'当前无线上版本'}</Typography.Text>}}]:[]),
        { title: '排序', width: 155, render: (_, row) => <Space><InputNumber aria-label={`第 ${row.index + 1} 部排序`} min={1} max={items.length} precision={0} value={row.index + 1} disabled={!canUpdate || saving} onChange={value => typeof value === 'number' && move(row.index, value - 1)} /><Flex vertical><Button type="text" aria-label={`上移第 ${row.index + 1} 部`} icon={<ArrowUp size={16} />} disabled={!canUpdate || saving || row.index === 0} onClick={() => move(row.index, row.index - 1)} /><Button type="text" aria-label={`下移第 ${row.index + 1} 部`} icon={<ArrowDown size={16} />} disabled={!canUpdate || saving || row.index === rows.length - 1} onClick={() => move(row.index, row.index + 1)} /></Flex></Space> },
        { title: '展示状态', width: 120, render: (_, row) => <Switch aria-label={`展示 ${row.drama?.title || row.dramaId}`} checkedChildren="展示" unCheckedChildren="隐藏" checked={row.visible} disabled={!canUpdate || saving} onChange={checked => void save(items.map((item, index) => index === row.index ? { ...item, visible: checked } : item))} /> },
        ...(!isHot ? [{ title: '创建时间', width: 180, render: (_: unknown, row: typeof rows[number]) => row.createdAt ? new Date(row.createdAt).toLocaleString('zh-CN', { hour12: false }) : '—' }] : []),
        { title: '操作', width: 180, render: (_, row) => canUpdate && <Space><Button aria-label="编辑" disabled={saving || loading} onClick={() => openEditor(row.index)}>编辑</Button><Button danger type="text" icon={<Trash2 size={16} />} disabled={saving} onClick={() => void save(items.filter((_, index) => index !== row.index))}>{isHot ? '移除' : '删除'}</Button></Space> },
      ]} />
    </Flex>
    <Modal title={`编辑${label}${isHot ? '短剧' : ''}`} open={editing !== undefined && picker !== 'replace'}
      onCancel={() => !saving && setEditing(undefined)} onOk={() => void submit()} okText="确定" cancelText="取消"
      confirmLoading={saving} okButtonProps={{ disabled: !selected, 'aria-label': '确定' }}
      cancelButtonProps={{ disabled: saving, 'aria-label': '取消' }} closable={!saving} keyboard={!saving} mask={{ closable: !saving }}>
      <Form layout="vertical">
        {error && <Alert type="error" showIcon title={error} />}
        <Form.Item label="关联短剧" required><Flex justify="space-between" align="center" gap={12}>
          <Typography.Text>{selected?.title}</Typography.Text>
          <Button disabled={saving} onClick={() => setPicker('replace')}>更换短剧</Button>
        </Flex></Form.Item>
        <Form.Item label={isHot ? '标题' : '轮播标题'}><Input aria-label={`${label}标题`} placeholder="默认使用短剧名称" maxLength={200} value={title} disabled={saving} onChange={event => setTitle(event.target.value)} /></Form.Item>
        <Form.Item label="展示状态"><Switch aria-label={`${label}展示状态`} checkedChildren="展示" unCheckedChildren="隐藏" checked={visible} disabled={saving} onChange={setVisible} /></Form.Item>
      </Form>
    </Modal>
    {picker && canUpdate && <DramaSelectionModal title={picker === 'add' ? `添加${label}短剧` : `更换${label}短剧`}
      configured={configuredDramas} capacity={picker === 'add' ? limit - items.length : 1} single={picker === 'replace'}
      loadTargets={loadTargets} submitting={saving} submitError={picker === 'add' ? error : undefined}
      onClose={() => setPicker(undefined)} onConfirm={dramas => {
        if (picker === 'add') {
          void addDramas(dramas)
        } else {
          setSelected(dramas[0])
          setPicker(undefined)
        }
      }} />}
  </Card>
}
