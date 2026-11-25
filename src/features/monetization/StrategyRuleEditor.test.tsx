import { fireEvent, render, screen } from '@testing-library/react'
import { Form } from 'antd'
import { useState } from 'react'
import { expect, test } from 'vitest'
import { ruleTemplates } from '../../unlockStrategies'
import { StrategyRuleEditor } from './StrategyRuleEditor'

/** CountdownEditor 使用真实表单编辑草稿，验证强弹开关对可选字段的保存语义。 */
function CountdownEditor() {
  const [rule, setRule] = useState(ruleTemplates.vip)
  return <Form layout="vertical">
    <StrategyRuleEditor rule={rule} index={0} ruleCount={1} strategyEnabled disabled={false} bound onChange={setRule} onMove={() => {}} onRemove={() => {}} />
    <output data-testid="config">{JSON.stringify(rule.config)}</output>
  </Form>
}

test('开启 VIP 强弹才出现倒计时，编辑可保存且关闭时清理配置，重新开启默认立即拉起', () => {
  render(<CountdownEditor />)
  expect(screen.queryByRole('spinbutton', { name: '规则 1 自动拉起倒计时' })).toBeNull()
  const toggle = screen.getByRole('switch', { name: '规则 1 入剧强制领取 VIP' })
  fireEvent.click(toggle)
  const input = screen.getByRole('spinbutton', { name: '规则 1 自动拉起倒计时' })
  expect(input).toHaveValue('0')
  expect(input).toHaveAttribute('aria-valuemin', '0')
  expect(input).toHaveAttribute('aria-valuemax', '300')
  expect(input).toHaveAccessibleDescription(/0 秒立即拉起/)
  fireEvent.change(input, { target: { value: '5' } })
  expect(JSON.parse(screen.getByTestId('config').textContent!)).toMatchObject({ requireBeforePlayback: true, entryAdCountdownSeconds: 5 })
  fireEvent.click(toggle)
  const closed = JSON.parse(screen.getByTestId('config').textContent!)
  expect(closed).not.toHaveProperty('entryAdCountdownSeconds')
  expect(closed).not.toHaveProperty('requireBeforePlayback')
  expect(closed.requiredAdCount).toBe(ruleTemplates.vip().config.requiredAdCount)
  fireEvent.click(toggle)
  expect(screen.getByRole('spinbutton', { name: '规则 1 自动拉起倒计时' })).toHaveValue('0')
})
