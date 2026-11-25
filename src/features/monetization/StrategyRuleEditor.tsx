import { Alert, Button, Col, Collapse, Divider, Flex, Form, Input, InputNumber, Radio, Row, Select, Space, Switch, Typography, theme } from 'antd'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { GrantTemplate, UnlockRule } from '../../domain'
import { ruleEffect, ruleName } from './strategyPresentation'

interface Props {
  /** 当前规则，编码和未编辑字段保持原值。 */
  rule: UnlockRule
  /** 规则当前的展示顺序，从零开始。 */
  index: number
  /** 规则总数，用于限制排序边界。 */
  ruleCount: number
  /** 策略总开关，用于区分配置效果与实际可用状态。 */
  strategyEnabled: boolean
  /** 无写权限或保存中时禁止更改。 */
  disabled: boolean
  /** 已配置策略新增的广告规则默认停用，启用前检查应用广告位。 */
  bound: boolean
  /** 更新当前规则草稿，不执行网络写入。 */
  onChange(rule: UnlockRule): void
  /** 将当前规则移动到指定的零基顺序。 */
  onMove(index: number): void
  /** 从草稿中移除当前规则，保存前可放弃修改。 */
  onRemove(): void
}

const benefits = [{ value: 'episode_access', label: '解锁后续剧集' }, { value: 'drama_access', label: '解锁当前整剧' }, { value: 'vip', label: '全站 VIP' }]
const periods = [{ value: 'unlimited', label: '永久有效' }, { value: 'day', label: '当天有效（小程序当地时间）' }, { value: 'duration', label: '指定时长' }, { value: 'billing_period', label: '随订阅周期' }]

// 新增分集权益默认每次解锁一集，不改写当前规则已经保存的集数。
function newBenefit(type: string, rule: UnlockRule): GrantTemplate {
  const validity = rule.type === 'subscription' ? 'billing_period' : type === 'vip' && rule.type === 'rewarded_ad' ? 'day' : 'unlimited'
  return { type, config: type === 'episode_access' ? { selection: 'next_locked_episodes', count: 1, validity } : type === 'drama_access' ? { selection: 'current_drama', includeFutureEpisodes: false, validity } : { scope: 'application', adFree: true, validity } }
}

/** StrategyRuleEditor 将权益、领取限制和可选文案分层展示，并实时说明配置效果。 */
export function StrategyRuleEditor({ rule, index, ruleCount, strategyEnabled, disabled, bound, onChange, onMove, onRemove }: Props) {
  const { token } = theme.useToken()
  const vip = rule.grants.some(grant => grant.type === 'vip')
  const entry = rule.type === 'entry_rewarded_ad'
  const ad = rule.type === 'rewarded_ad' || entry
  const autoUnlock = (rule.config.autoUnlock ?? { enabled: false, countdownSeconds: 5, title: '', content: '' }) as Record<string, unknown>
  const setAutoUnlock = (key: string, next: unknown) => setConfig('autoUnlock', { ...autoUnlock, [key]: next })
  const limited = rule.config.dailyRewardLimit !== undefined && rule.config.dailyRewardLimit !== 0
  const setConfig = (key: string, next: unknown) => onChange({ ...rule, config: { ...rule.config, [key]: next } })
  const setIncompletePrompt = (enabled: boolean) => {
    // 关闭时省略新字段，使旧服务端仍能保存未启用该能力的规则。
    const config = { ...rule.config }
    delete config.promptOnIncomplete
    delete config.incompleteAdCountdownSeconds
    delete config.incompleteAdDisplayCountdownSeconds
    if (enabled) config.promptOnIncomplete = true
    onChange({ ...rule, config })
  }
  const setRequireBeforePlayback = (enabled: boolean) => {
    // 关闭时省略字段，旧策略和旧服务端继续按自愿领取 VIP 处理。
    const config = { ...rule.config }
    if (enabled) config.requireBeforePlayback = true
    else {
      delete config.requireBeforePlayback
      delete config.entryAdCountdownSeconds
    }
    onChange({ ...rule, config })
  }
  const numberField = (key: string, label: string, min: number, max: number, help?: string, suffix?: string) => <Form.Item label={label} htmlFor={`rule-${index}-${key}`} extra={help && <span id={`rule-${index}-${key}-help`}>{help}</span>}>
    <InputNumber id={`rule-${index}-${key}`} aria-label={`规则 ${index + 1} ${label}`} aria-describedby={help ? `rule-${index}-${key}-help` : undefined} styles={{ root: { width: '100%' } }} min={min} max={max} precision={0} disabled={disabled} value={rule.config[key] === null ? null : Number(rule.config[key] ?? min)} onChange={next => setConfig(key, next)} suffix={suffix} />
  </Form.Item>
  return <Flex vertical gap="middle">
    <Flex justify="space-between" align="center" gap="middle" wrap>
      <Typography.Title level={4}>{ruleName(rule)}</Typography.Title>
      <Space wrap>
        <Switch aria-label={`规则 ${index + 1} 启用`} disabled={disabled} checked={rule.enabled} onChange={enabled => onChange({ ...rule, enabled })} />
        <Typography.Text>{rule.enabled ? '启用' : '停用'}</Typography.Text>
        <Button aria-label={`上移规则 ${index + 1}`} title="上移" icon={<ArrowUp size={16} />} disabled={disabled || index === 0} onClick={() => onMove(index - 1)} />
        <Button aria-label={`下移规则 ${index + 1}`} title="下移" icon={<ArrowDown size={16} />} disabled={disabled || index === ruleCount - 1} onClick={() => onMove(index + 1)} />
        <Button danger aria-label={`删除规则 ${index + 1}`} title="删除此规则" icon={<Trash2 size={16} />} disabled={disabled} onClick={onRemove} />
      </Space>
    </Flex>
    <Alert type="info" styles={{ root: { background: token.colorFillAlter, borderColor: 'transparent' } }} title="规则效果" description={<Flex vertical gap={4}>
      <Typography.Text>{ruleEffect(rule)}</Typography.Text>
      {!ad ? <Typography.Text type="secondary">支付待接入：当前仅保存配置，暂不向观众提供购买入口。</Typography.Text>
        : !strategyEnabled ? <Typography.Text type="secondary">策略已停用，当前不提供新的解锁入口。</Typography.Text>
          : !rule.enabled && <Typography.Text type="secondary">此规则未启用，当前不向观众展示。{bound && '新增广告规则默认停用，确认当前应用广告位配置后可启用。'}</Typography.Text>}
    </Flex>} />
    {entry && <div>
      <Typography.Title level={5}>入剧条件</Typography.Title>
      <Row gutter={24}>
        <Col xs={24} sm={12}><Form.Item label="统计范围" extra="每部剧的计数仍按用户隔离。">
          <Select aria-label={`规则 ${index + 1} 入剧统计范围`} disabled={disabled} value={String(rule.config.scope ?? 'user')} options={[{ value: 'user', label: '每人每天' }, { value: 'user_drama', label: '每人每部剧每天' }]} onChange={next => {
            const config = { ...rule.config }
            if (next === 'user') delete config.scope
            else config.scope = next
            onChange({ ...rule, config })
          }} />
        </Form.Item></Col>
        <Col xs={24} sm={12}><Form.Item label="达标方式" extra="未达标自动重拉；完整观看模式下提前关闭不计数。">
          <Select aria-label={`规则 ${index + 1} 入剧达标方式`} disabled={disabled} value={String(rule.config.countBy ?? 'completed')} options={[{ value: 'shown', label: '成功展示' }, { value: 'completed', label: '完整观看' }]} onChange={next => {
            const config = { ...rule.config }
            if (next === 'completed') delete config.countBy
            else config.countBy = next
            onChange({ ...rule, config })
          }} />
        </Form.Item></Col>
        <Col xs={24} sm={12}>{numberField('requiredAdCount', '每日达标次数', 1, 100, rule.config.countBy === 'shown' ? '成功展示即计数，提前关闭也计入；当天达到次数后跳过对应范围的入剧广告。' : '仅完整观看并成功结算计数；当天达到次数后跳过对应范围的入剧广告。', '次')}</Col>
      </Row>
      <Typography.Paragraph type="secondary">免费集和已有权益同样执行入剧条件；小程序按统计范围和达标方式判断，未达标自动重拉广告。</Typography.Paragraph>
    </div>}
    {ad && vip && <div>
      <Typography.Title level={5}>达成条件</Typography.Title>
      <Row gutter={24}><Col xs={24} sm={12}>{numberField('requiredAdCount', '所需广告次数', 1, 10, '当天累计看满后，用户点击领取才激活 VIP。', '次')}</Col></Row>
      <Form.Item label="入剧强制领取 VIP" extra="开启后，新版小程序在播放前要求领取 VIP；若同时启用入剧广告，先看完入剧广告，再完成 VIP 广告并领取。">
        <Switch aria-label={`规则 ${index + 1} 入剧强制领取 VIP`} disabled={disabled} checked={rule.config.requireBeforePlayback === true} onChange={setRequireBeforePlayback} />
      </Form.Item>
      {rule.config.requireBeforePlayback === true && <Row gutter={24}><Col xs={24} sm={12}>
        {numberField('entryAdCountdownSeconds', '自动拉起倒计时', 0, 300, '0 秒立即拉起；每次自动拉起前倒计时，切到后台暂停，提前关闭后重新倒计时。', '秒')}
      </Col></Row>}
    </div>}
    {!ad && <Form.Item label="商品编码" required extra="用于标识当前小程序的商品；平台商品 ID 在下方配置。"><Input aria-label={`规则 ${index + 1} 商品编码`} disabled={disabled} maxLength={64} value={String(rule.config.productCode ?? '')} onChange={event => setConfig('productCode', event.target.value)} /></Form.Item>}
    {!entry && <Flex vertical gap="small">
      <Typography.Title level={5}>发放权益</Typography.Title>
      {rule.grants.map((grant, grantIndex) => {
        const config = grant.config
        const update = (next: GrantTemplate) => onChange({ ...rule, grants: rule.grants.map((item, i) => i === grantIndex ? next : item) })
        const patch = (key: string, next: unknown) => update({ ...grant, config: { ...config, [key]: next } })
        const available = ad ? vip ? benefits.filter(item => item.value === 'vip') : benefits.filter(item => item.value !== 'vip') : benefits
        const validityOptions = ad && vip ? periods.filter(item => item.value === 'day') : periods.filter(item => rule.type === 'subscription' || item.value !== 'billing_period')
        return <div key={grantIndex}>
          {rule.grants.length > 1 && <Flex justify="space-between" align="center"><Typography.Text strong>权益 {grantIndex + 1}</Typography.Text><Button type="text" danger disabled={disabled} aria-label={`规则 ${index + 1} 删除权益 ${grantIndex + 1}`} onClick={() => onChange({ ...rule, grants: rule.grants.filter((_, i) => i !== grantIndex) })}>移除</Button></Flex>}
          <Row gutter={24}>
            <Col xs={24} sm={12}><Form.Item label="权益类型"><Select aria-label={`规则 ${index + 1} 权益 ${grantIndex + 1} 类型`} disabled={disabled} value={grant.type} options={available} onChange={type => update(newBenefit(type, rule))} /></Form.Item></Col>
            {grant.type === 'episode_access' && <Col xs={24} sm={12}><Form.Item label="每次解锁集数" required><InputNumber aria-label={`规则 ${index + 1} 权益 ${grantIndex + 1} 解锁集数`} styles={{ root: { width: '100%' } }} disabled={disabled} min={1} max={10000} precision={0} value={config.count as number} onChange={next => patch('count', next)} suffix="集" /></Form.Item></Col>}
            {grant.type === 'drama_access' && <Col xs={24} sm={12}><Form.Item label="包含后续更新" extra="当前短剧将来新增的剧集也可观看。"><Switch aria-label={`规则 ${index + 1} 权益 ${grantIndex + 1} 包含后续更新`} disabled={disabled} checked={Boolean(config.includeFutureEpisodes)} onChange={next => patch('includeFutureEpisodes', next)} /></Form.Item></Col>}
            {grant.type === 'vip' && <Col xs={24} sm={12}><Form.Item label="VIP 免广告" extra="VIP 仅在各自小程序内生效。"><Switch aria-label={`规则 ${index + 1} 权益 ${grantIndex + 1} 免广告`} disabled={disabled} checked={Boolean(config.adFree)} onChange={next => patch('adFree', next)} /></Form.Item></Col>}
            <Col xs={24} sm={12}><Form.Item label="权益有效期"><Select aria-label={`规则 ${index + 1} 权益 ${grantIndex + 1} 有效期`} disabled={disabled} value={String(config.validity)} options={validityOptions} onChange={validity => {
              const next: Record<string, unknown> = { ...config, validity }
              delete next.durationSeconds
              if (validity === 'duration') next.durationSeconds = 86400
              update({ ...grant, config: next })
            }} /></Form.Item></Col>
            {config.validity === 'duration' && <Col xs={24} sm={12}><Form.Item label="有效时长（秒）" required extra="86400 秒 = 1 天；3600 秒 = 1 小时。"><InputNumber aria-label={`规则 ${index + 1} 权益 ${grantIndex + 1} 时长`} styles={{ root: { width: '100%' } }} disabled={disabled} min={1} max={315360000} precision={0} value={config.durationSeconds as number} onChange={next => patch('durationSeconds', next)} /></Form.Item></Col>}
          </Row>
        </div>
      })}
      {!disabled && <Flex><Button type="link" styles={{ root: { padding: 0 } }} icon={<Plus size={16} />} disabled={rule.grants.length >= 16} onClick={() => onChange({ ...rule, grants: [...rule.grants, newBenefit(ad && vip ? 'vip' : 'episode_access', rule)] })}>叠加其他权益</Button></Flex>}
    </Flex>}
    {ad && !vip && !entry && <>
      <Divider styles={{ root: { margin: 0 } }} />
      <div>
        <Typography.Title level={5}>未看完广告提示</Typography.Title>
        <Form.Item label="强弹广告弹窗" extra="默认关闭。开启后，用户提前关闭逐集广告时显示不可关闭的提示，到时自动重新拉起广告；未看完不会发放权益。">
          <Switch aria-label={`规则 ${index + 1} 强弹广告弹窗`} disabled={disabled} checked={rule.config.promptOnIncomplete === true} onChange={setIncompletePrompt} />
        </Form.Item>
        {rule.config.promptOnIncomplete === true && <Row gutter={24}><Col xs={24} sm={12}><Form.Item label="重看倒计时（秒）" required extra="实际等待时间，默认 3 秒；切到后台时暂停。">
          <InputNumber aria-label={`规则 ${index + 1} 重看倒计时`} styles={{ root: { width: '100%' } }} disabled={disabled} min={1} max={300} precision={0} value={rule.config.incompleteAdCountdownSeconds === null ? null : Number(rule.config.incompleteAdCountdownSeconds ?? 3)} onChange={next => setConfig('incompleteAdCountdownSeconds', next)} />
        </Form.Item></Col><Col xs={24} sm={12}><Form.Item label="显示倒计时（秒）" extra="仅控制弹窗数字；在实际等待时间内从此数走到 0，留空时与重看倒计时相同。">
          <InputNumber aria-label={`规则 ${index + 1} 显示倒计时`} styles={{ root: { width: '100%' } }} disabled={disabled} min={1} max={300} precision={0} placeholder={String(rule.config.incompleteAdCountdownSeconds ?? 3)} value={rule.config.incompleteAdDisplayCountdownSeconds === undefined ? undefined : Number(rule.config.incompleteAdDisplayCountdownSeconds)} onChange={next => {
            const config = { ...rule.config }
            if (next === null) delete config.incompleteAdDisplayCountdownSeconds
            else config.incompleteAdDisplayCountdownSeconds = next
            onChange({ ...rule, config })
          }} />
        </Form.Item></Col></Row>}
      </div>
      {(rule.grants.some(grant => grant.type === 'episode_access') || autoUnlock.enabled === true) && <div>
        <Typography.Title level={5}>自动解锁</Typography.Title>
        <Form.Item label="自动解锁剩余剧集" extra="看完广告后，若本剧仍有未解锁集则弹出倒计时；到时继续看广告，用户可取消并播放当前集。">
          <Switch aria-label={`规则 ${index + 1} 自动解锁`} disabled={disabled} checked={autoUnlock.enabled === true} onChange={next => setAutoUnlock('enabled', next)} />
        </Form.Item>
        {autoUnlock.enabled === true && <Row gutter={24}>
          <Col xs={24} sm={12}><Form.Item label="解锁倒计时（秒）" required extra="默认 5 秒，切到后台时暂停倒计时。">
            <InputNumber aria-label={`规则 ${index + 1} 解锁倒计时`} styles={{ root: { width: '100%' } }} disabled={disabled} min={1} max={300} precision={0} value={autoUnlock.countdownSeconds as number} onChange={next => setAutoUnlock('countdownSeconds', next)} />
          </Form.Item></Col>
          <Col span={24}><Form.Item label="弹窗标题" extra="留空使用小程序默认英文文案。"><Input aria-label={`规则 ${index + 1} 自动解锁标题`} disabled={disabled} maxLength={255} value={String(autoUnlock.title ?? '')} onChange={event => setAutoUnlock('title', event.target.value)} /></Form.Item></Col>
          <Col span={24}><Form.Item label="弹窗说明"><Input.TextArea aria-label={`规则 ${index + 1} 自动解锁说明`} disabled={disabled} maxLength={500} rows={3} value={String(autoUnlock.content ?? '')} onChange={event => setAutoUnlock('content', event.target.value)} /></Form.Item></Col>
        </Row>}
      </div>}
    </>}
    {ad && !entry && <><Divider styles={{ root: { margin: 0 } }} /><div>
      <Typography.Title level={5}>领取限制</Typography.Title>
      <Row gutter={24}>
        <Col xs={24} sm={12}><Form.Item label="每日上限" extra={vip ? '每位用户每天可计入进度的广告次数，不能少于所需次数。' : '每位用户每天可领取的次数。'}>
          <Radio.Group aria-label={`规则 ${index + 1} 每日上限方式`} value={limited ? 'limited' : 'unlimited'} disabled={disabled} onChange={event => setConfig('dailyRewardLimit', event.target.value === 'unlimited' ? 0 : Math.max(1, Number(rule.config.requiredAdCount) || 1))} optionType="button" options={[{ label: '不限制', value: 'unlimited' }, { label: '设置上限', value: 'limited' }]} />
        </Form.Item></Col>
        {limited && <Col xs={24} sm={12}>{numberField('dailyRewardLimit', '每日最多次数', 1, 10000, undefined, '次')}</Col>}
      </Row>
    </div><Divider styles={{ root: { margin: 0 } }} />
      {!vip && <Collapse ghost styles={{ header: { paddingInline: 0 }, body: { paddingInline: 0 } }} items={[
        { key: 'copy', label: '入口文案（可选）', children: <><Typography.Paragraph type="secondary">留空时使用小程序默认文案。</Typography.Paragraph><Row gutter={24}>{([['title', '入口标题', 255], ['content', '入口说明', 500], ['failureMessage', '广告失败提示', 500]] as const).map(([key, label, max]) => <Col key={key} xs={24} sm={key === 'title' ? 24 : 12}><Form.Item label={label}><Input aria-label={`规则 ${index + 1} ${label}`} disabled={disabled} maxLength={max} value={String(rule.config[key] ?? '')} onChange={event => setConfig(key, event.target.value)} /></Form.Item></Col>)}</Row></> },
      ]} />}
    </>}
  </Flex>
}
