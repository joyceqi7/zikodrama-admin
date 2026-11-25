import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, Col, ConfigProvider, Empty, Flex, Form, Input, InputNumber, Row, Skeleton, Space, Switch, Typography, theme } from 'antd'
import type { OperationsApi } from '../../api'
import type { Application } from '../../applications'
import type { ApplicationStrategy, StrategyBinding, StrategyDocument } from '../../domain'
import { applicationAdUnitsError } from '../../applicationAdUnits'
import { PageHeader, PageStack } from '../../components/PageHeader'
import { defaultStrategyDocument, reportStrategyFailure, strategyModeError } from '../../unlockStrategies'
import { StrategyDocumentEditor } from './StrategyDocumentEditor'
import { strategyFormError } from './strategyForm'

interface Props {
  /** api 读取和保存当前应用唯一的解锁策略。 */
  api: OperationsApi
  /** application 是右上角选中的当前应用。 */
  application?: Application
  /** canUpdate 控制面板是否允许修改。 */
  canUpdate: boolean
  /** notify 展示统一的保存结果。 */
  notify(message: string, tone?: 'success' | 'error'): void
  /** onEditingStateChange 将草稿和保存状态同步给页面外壳。 */
  onEditingStateChange?(dirty: boolean, saving: boolean): void
}

/** UnlockStrategyManagement 直接编辑当前应用唯一的策略面板，不维护策略名称或列表。 */
export function UnlockStrategyManagement({ api, application, canUpdate, notify, onEditingStateChange }: Props) {
  const { token } = theme.useToken()
  const applicationId = application?.id ?? ''
  const mode = application?.monetizationMode ?? 'IAA'
  const requestID = useRef(0)
  const [snapshot, setSnapshot] = useState<ApplicationStrategy | null>(null)
  const [document, setDocument] = useState<StrategyDocument>(() => defaultStrategyDocument())
  const [products, setProducts] = useState<StrategyBinding['rules']>({})
  const [selectedCode, setSelectedCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')

  const initialDocument = useMemo(() => snapshot?.strategy?.document ?? defaultStrategyDocument(mode), [mode, snapshot])
  const dirty = snapshot !== null && (
    JSON.stringify(document) !== JSON.stringify(initialDocument)
    || JSON.stringify(products) !== JSON.stringify(snapshot.rules)
  )

  useEffect(() => { onEditingStateChange?.(dirty, saving) }, [dirty, saving, onEditingStateChange])
  useEffect(() => () => onEditingStateChange?.(false, false), [onEditingStateChange])
  useEffect(() => {
    if (!dirty && !saving) return
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', preventLoss)
    return () => window.removeEventListener('beforeunload', preventLoss)
  }, [dirty, saving])

  const applySnapshot = useCallback((next: ApplicationStrategy) => {
    const nextDocument = structuredClone(next.strategy?.document ?? defaultStrategyDocument(next.monetizationMode))
    setSnapshot(next)
    setDocument(nextDocument)
    setProducts(structuredClone(next.rules))
    setSelectedCode(nextDocument.rules[0]?.code ?? '')
    setFormError('')
  }, [])

  const load = useCallback(async () => {
    const id = ++requestID.current
    if (!applicationId) { setSnapshot(null); setLoadError(''); return }
    setLoading(true)
    try {
      const next = await api.getApplicationStrategy(applicationId)
      if (id === requestID.current) { applySnapshot(next); setLoadError('') }
    } catch (error) {
      const message = reportStrategyFailure('读取', error)
      if (id === requestID.current) setLoadError(message)
    } finally {
      if (id === requestID.current) setLoading(false)
    }
  }, [api, applicationId, applySnapshot])

  useEffect(() => {
    const activeRequestID = requestID
    void load()
    return () => { activeRequestID.current++ }
  }, [load])

  const changeDocument = (next: StrategyDocument) => { setDocument(next); setFormError('') }
  const reset = () => {
    if (!snapshot) return
    applySnapshot(snapshot)
  }
  const save = async () => {
    if (!application || !snapshot || !canUpdate || saving) return
    // VIP 已停用旧自动提示及入口文案，保存其他调整时一并移除隐藏字段。
    const nextDocument = { ...document, rules: document.rules.map(rule => {
      if (rule.type !== 'rewarded_ad' || !rule.grants.some(grant => grant.type === 'vip')) return rule
      const { forceWatchCount, delaySeconds, title, content, failureMessage, ...config } = rule.config
      void forceWatchCount; void delaySeconds; void title; void content; void failureMessage
      return { ...rule, config }
    }) }
    const validation = strategyModeError(nextDocument, mode) || strategyFormError(nextDocument)
    if (validation) {
      setFormError(validation)
      const match = /^规则 (\d+)：/.exec(validation)
      if (match) setSelectedCode(document.rules[Number(match[1]) - 1]?.code ?? '')
      return
    }
    if (document.enabled && document.rules.some((rule) => rule.enabled && ['rewarded_ad', 'entry_rewarded_ad'].includes(rule.type)) && applicationAdUnitsError(application.adUnits)) {
      setFormError('启用前请先在应用配置中配齐激励视频候选广告位和一个插屏广告位。')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const rules = Object.fromEntries(document.rules
        .filter((rule) => !['rewarded_ad', 'entry_rewarded_ad'].includes(rule.type) && products[rule.code]?.productId)
        .map((rule) => [rule.code, { productId: products[rule.code].productId }]))
      const saved = await api.saveApplicationStrategy({ document: nextDocument, rules }, application.id)
      applySnapshot(saved)
      notify('解锁策略已保存')
    } catch (error) {
      const message = reportStrategyFailure('保存', error)
      setFormError(message)
      notify(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!application) return <PageStack><PageHeader title="解锁策略" eyebrow="请先在右上角选择应用。" /><Empty description="未选择应用" image={Empty.PRESENTED_IMAGE_SIMPLE} /></PageStack>

  return <ConfigProvider theme={{ components: { Form: { itemMarginBottom: 16 }, Typography: { titleMarginTop: 0, titleMarginBottom: 8 } } }}>
    <PageStack>
      <PageHeader
        title="解锁策略"
        eyebrow={`当前应用：${application.name} · ${mode}。每种解锁方式最多配置一个。`}
        actions={<Space><Button onClick={() => void load()} loading={loading}>刷新</Button>{canUpdate && <Button onClick={reset} disabled={!dirty || saving}>还原</Button>}<Button type="primary" loading={saving} disabled={!canUpdate || loading || !snapshot} onClick={() => void save()}>保存</Button></Space>}
      />
      {loadError && <Alert type="error" showIcon title="解锁策略加载失败" description={loadError} action={<Button size="small" onClick={() => void load()}>重试</Button>} />}
      {loading && !snapshot ? <Skeleton active paragraph={{ rows: 8 }} /> : snapshot && <Form layout="vertical" disabled={!canUpdate || saving}>
        <Card size="small">
          <Row gutter={24} align="middle">
            <Col xs={16} md={8}><Form.Item label="免费试看集数" required tooltip="每部短剧前多少集可免费观看；0 表示不提供免费试看。"><InputNumber aria-label="免费试看集数" styles={{ root: { width: '100%' } }} min={0} max={10000} precision={0} value={document.freeEpisodeCount} onChange={(value) => changeDocument({ ...document, freeEpisodeCount: value as number })} suffix="集" /></Form.Item></Col>
            <Col xs={8} md={4}><Form.Item label="策略状态"><Switch aria-label="策略状态" checked={document.enabled} checkedChildren="启用" unCheckedChildren="停用" onChange={(enabled) => changeDocument({ ...document, enabled })} /></Form.Item></Col>
            {mode !== 'IAP' && <Col xs={24} md={6}><Form.Item label="插屏广告" extra="关闭后首页及播放暂停时不再展示插屏广告。"><Switch aria-label="开启插屏广告" checked={document.interstitialEnabled !== false} checkedChildren="开启" unCheckedChildren="关闭" onChange={(interstitialEnabled) => changeDocument({ ...document, interstitialEnabled })} /></Form.Item></Col>}
            <Col xs={24} md={mode === 'IAP' ? 12 : 6}><Alert showIcon type="info" styles={{ root: { background: token.colorFillAlter, borderColor: 'transparent' } }} title="保存只更新当前应用，已获得的权益继续有效。" /></Col>
          </Row>
          {mode !== 'IAP' && <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item label="首次入剧广告延后" htmlFor="entry-ad-delay" extra={<span id="entry-ad-delay-help">首集播放指定秒数后，再执行入剧、强制 VIP 或首集解锁广告。填 0 立即执行，或填 4–300 秒。</span>}>
                <InputNumber id="entry-ad-delay" aria-describedby="entry-ad-delay-help" min={0} max={300} precision={0}
                  value={document.entryAdDelaySeconds ?? 0} onChange={(value) => changeDocument({ ...document, entryAdDelaySeconds: value ?? 0 })} suffix="秒" />
              </Form.Item>
            </Col>
          </Row>}
        </Card>
        <StrategyDocumentEditor monetizationMode={mode} value={document} onChange={changeDocument} disabled={!canUpdate || saving} bound={!!snapshot.strategy} selectedCode={selectedCode} onSelect={setSelectedCode} />
        {document.rules.filter((rule) => !['rewarded_ad', 'entry_rewarded_ad'].includes(rule.type)).map((rule) => <Form.Item key={rule.code} label={`${rule.code} 平台商品`} tooltip="支付接入完成前仅保存商品标识。">
          <Input aria-label={`${rule.code} 平台商品`} maxLength={255} value={products[rule.code]?.productId ?? ''} onChange={(event) => setProducts((current) => ({ ...current, [rule.code]: { productId: event.target.value } }))} />
        </Form.Item>)}
        {formError && <Alert type="error" showIcon title={formError} role="alert" />}
        <Flex justify="flex-end" gap="small"><Typography.Text type="secondary">{dirty ? '有未保存修改' : '已保存'}</Typography.Text></Flex>
      </Form>}
    </PageStack>
  </ConfigProvider>
}
