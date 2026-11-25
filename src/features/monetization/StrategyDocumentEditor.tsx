import { Badge, Button, Col, Dropdown, Empty, Flex, Grid, Row, Select, Typography, theme } from 'antd'
import { ChevronDown, Plus } from 'lucide-react'
import type { ApplicationMonetizationMode } from '../../applications'
import type { StrategyDocument, UnlockRule } from '../../domain'
import { ruleAllowedForMode, ruleTemplates, unlockWayKey } from '../../unlockStrategies'
import { ruleName, ruleSummary } from './strategyPresentation'
import { StrategyRuleEditor } from './StrategyRuleEditor'

interface Props {
  /** 当前小程序变现模式，限定可添加的解锁方式。 */
  monetizationMode?: ApplicationMonetizationMode
  /** 当前策略草稿；已有规则编码和未修改字段保持原值。 */
  value: StrategyDocument
  /** 更新草稿，不直接写入服务端。 */
  onChange(value: StrategyDocument): void
  /** 没有写权限或保存中时禁止所有编辑。 */
  disabled: boolean
  /** 当前应用已有策略时，新增广告规则先停用，避免缺少广告位无法保存。 */
  bound: boolean
  /** 当前选中的稳定规则编码，排序不改变选中项。 */
  selectedCode: string
  /** 切换正在编辑的规则，保留其他规则的草稿。 */
  onSelect(code: string): void
}

/** StrategyDocumentEditor 通过规则导航与单个编辑面板，平铺呈现解锁配置。 */
export function StrategyDocumentEditor({ value, onChange, disabled, bound, selectedCode, onSelect, monetizationMode = 'IAA' }: Props) {
  const { token } = theme.useToken()
  const screens = Grid.useBreakpoint()
  const selectedIndex = Math.max(0, value.rules.findIndex(rule => rule.code === selectedCode))
  const selected = value.rules[selectedIndex]
  const configuredWays = new Set(value.rules.map(unlockWayKey).filter(Boolean))
  const addMenuItems = [
    ...(monetizationMode !== 'IAP' ? [
      ...(!configuredWays.has('entry') ? [{ key: 'entry', label: '添加入剧广告' }] : []),
      ...(!configuredWays.has('episode') ? [{ key: 'episode', label: '添加逐集广告' }] : []),
      ...(!configuredWays.has('vip') ? [{ key: 'vip', label: '添加广告 VIP' }] : []),
    ] : []),
    ...(monetizationMode !== 'IAA' && (!configuredWays.has('purchase') || !configuredWays.has('subscription')) ? [{ key: 'paid', type: 'group' as const, label: '支付待接入 · 可预先配置', children: [
      ...(!configuredWays.has('purchase') ? [{ key: 'purchase', label: '添加单次购买' }] : []),
      ...(!configuredWays.has('subscription') ? [{ key: 'subscription', label: '添加订阅 VIP' }] : []),
    ] }] : []),
  ]
  // 按当前模式剩余的菜单项判断是否配齐；停用规则仍占用该解锁方式。
  const allConfigured = addMenuItems.length === 0
  const patchRule = (next: UnlockRule) => onChange({ ...value, rules: value.rules.map((rule, i) => i === selectedIndex ? next : rule) })
  const add = (type: string) => {
    const rule = ruleTemplates[type]()
    if (!ruleAllowedForMode(monetizationMode, rule.type)) return
    if (configuredWays.has(type as keyof typeof ruleTemplates)) return
    // 新广告规则默认停用，启用时校验当前应用配置的广告位。
    if (bound && (rule.type === 'rewarded_ad' || rule.type === 'entry_rewarded_ad')) rule.enabled = false
    onChange({ ...value, rules: [...value.rules, rule] })
    onSelect(rule.code)
  }
  const move = (to: number) => {
    const rules = [...value.rules]
    ;[rules[selectedIndex], rules[to]] = [rules[to], rules[selectedIndex]]
    onChange({ ...value, rules })
  }
  const remove = () => {
    const rules = value.rules.filter((_, index) => index !== selectedIndex)
    onChange({ ...value, rules })
    onSelect(rules[Math.min(selectedIndex, rules.length - 1)]?.code ?? '')
  }
  return <Row gutter={[32, 24]}>
    <Col xs={24} lg={7} xl={6}>
      <Flex vertical gap="middle">
        <Flex vertical gap={4}>
          <Typography.Title level={5}>解锁方式</Typography.Title>
          <Typography.Text type="secondary">按此顺序向观众展示</Typography.Text>
        </Flex>
        {screens.lg === false && value.rules.length > 0 ? <Select aria-label="当前解锁方式" value={selected?.code} onChange={onSelect} options={value.rules.map((rule, index) => ({ value: rule.code, label: `${index + 1}. ${ruleName(rule)} · ${rule.enabled ? ['rewarded_ad', 'entry_rewarded_ad'].includes(rule.type) ? '已启用' : '待接入' : '未启用'}` }))} /> : <Flex vertical gap="small" role="navigation" aria-label="解锁方式列表">
          {value.rules.map((rule, index) => <Button key={rule.code} block
            aria-label={`选择规则 ${index + 1} ${ruleName(rule)}`} aria-pressed={rule.code === selected?.code}
            onClick={() => onSelect(rule.code)}
            styles={{ root: { height: 'auto', minHeight: 88, padding: 12, whiteSpace: 'normal', textAlign: 'left', justifyContent: 'flex-start', borderColor: rule.code === selected?.code ? token.colorPrimary : 'transparent', background: rule.code === selected?.code ? token.colorPrimaryBg : 'transparent', boxShadow: 'none' }, content: { width: '100%' } }}>
            <Flex vertical gap={6}>
              <Flex justify="space-between" align="center" gap="small" wrap>
                <Typography.Text strong>{index + 1}. {ruleName(rule)}</Typography.Text>
                <Badge status={!rule.enabled ? 'default' : ['rewarded_ad', 'entry_rewarded_ad'].includes(rule.type) ? 'success' : 'warning'} text={!rule.enabled ? '未启用' : ['rewarded_ad', 'entry_rewarded_ad'].includes(rule.type) ? '已启用' : '待接入'} />
              </Flex>
              <Typography.Text type="secondary">{ruleSummary(rule)}</Typography.Text>
            </Flex>
          </Button>)}
        </Flex>}
        {!disabled && <Dropdown trigger={['click']} disabled={allConfigured} menu={{ items: addMenuItems, onClick: ({ key }) => add(key) }}>
          <Button block icon={<Plus size={16} />} disabled={allConfigured}>添加解锁方式 <ChevronDown size={14} /></Button>
        </Dropdown>}
        {allConfigured && <Typography.Text type="secondary">当前变现模式的解锁方式均已配置</Typography.Text>}
      </Flex>
    </Col>
    <Col xs={24} lg={17} xl={18}>
      {selected ? <StrategyRuleEditor key={selected.code} rule={selected} index={selectedIndex} ruleCount={value.rules.length} strategyEnabled={value.enabled} disabled={disabled} bound={bound} onChange={patchRule} onMove={move} onRemove={remove} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有解锁方式，请选择“添加解锁方式”。" />}
    </Col>
  </Row>
}
