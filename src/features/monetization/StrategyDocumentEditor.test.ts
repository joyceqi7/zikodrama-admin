import { expect, test } from 'vitest'
import { strategyFormError } from './strategyForm'
import { ruleEffect } from './strategyPresentation'
import { defaultStrategyDocument, ruleTemplates } from '../../unlockStrategies'

test('自动解锁只适用于逐集广告，限制倒计时与弹窗文案', () => {
  const document = defaultStrategyDocument()
  const config = document.rules[0].config
  config.autoUnlock = { enabled: true, countdownSeconds: 5, title: '继续解锁', content: '取消后播放' }
  expect(strategyFormError(document)).toBe('')
  for (const value of [0, -1, 301, 1.5, null]) {
    config.autoUnlock = { enabled: true, countdownSeconds: value }
    expect(strategyFormError(document)).toContain('倒计时')
  }
  config.autoUnlock = { enabled: true, countdownSeconds: 5, title: '字'.repeat(256) }
  expect(strategyFormError(document)).toContain('文案')
  document.rules = [ruleTemplates.vip()]
  document.rules[0].config.autoUnlock = { enabled: true, countdownSeconds: 5 }
  expect(strategyFormError(document)).toContain('仅支持逐集')
})

test('未看完广告弹窗默认关闭，只允许逐集广告启用布尔开关', () => {
  const document = defaultStrategyDocument()
  expect(document.rules[0].config.promptOnIncomplete).toBeUndefined()
  document.rules[0].config.promptOnIncomplete = true
  expect(strategyFormError(document)).toBe('')
  document.rules[0].config.incompleteAdCountdownSeconds = 5
  expect(strategyFormError(document)).toBe('')
  document.rules[0].config.incompleteAdCountdownSeconds = 3
  document.rules[0].config.incompleteAdDisplayCountdownSeconds = 5
  expect(strategyFormError(document)).toBe('')
  for (const value of [0, -1, 301, 1.5, null]) {
    document.rules[0].config.incompleteAdDisplayCountdownSeconds = value
    expect(strategyFormError(document)).toContain('显示倒计时')
  }
  delete document.rules[0].config.incompleteAdDisplayCountdownSeconds
  for (const value of [0, -1, 301, 1.5, null]) {
    document.rules[0].config.incompleteAdCountdownSeconds = value
    expect(strategyFormError(document)).toContain('重看倒计时')
  }
  delete document.rules[0].config.incompleteAdCountdownSeconds
  document.rules[0].config.incompleteAdDisplayCountdownSeconds = 5
  document.rules[0].config.promptOnIncomplete = false
  expect(strategyFormError(document)).toContain('显示倒计时')
  delete document.rules[0].config.incompleteAdDisplayCountdownSeconds
  document.rules[0].config.promptOnIncomplete = 'true'
  expect(strategyFormError(document)).toContain('未看完广告弹窗')
  document.rules = [ruleTemplates.vip()]
  document.rules[0].config.promptOnIncomplete = true
  expect(strategyFormError(document)).toContain('未看完广告弹窗')
})

test('模板都可保存，广告 VIP 的阈值和权益组合受约束', () => {
  const document = defaultStrategyDocument()
  for (const template of Object.values(ruleTemplates)) {
    document.rules = [template()]
    expect(strategyFormError(document)).toBe('')
  }
  document.rules = [ruleTemplates.vip()]
  document.rules[0].config.dailyRewardLimit = 1
  expect(strategyFormError(document)).toContain('每日上限')
  document.rules[0].config.dailyRewardLimit = 0
  document.rules[0].grants.push(ruleTemplates.episode().grants[0])
  expect(strategyFormError(document)).toContain('当天 VIP')
})

test('入剧广告按自然日配置次数且不能附带分集权益', () => {
  const document = defaultStrategyDocument()
  document.rules = [ruleTemplates.entry()]
  expect(strategyFormError(document)).toBe('')
  expect(ruleEffect(document.rules[0])).toContain('每天进入任一短剧播放前')
  for (const count of [1, 10, 100]) {
    document.rules[0].config.requiredAdCount = count
    expect(strategyFormError(document)).toBe('')
  }
  document.rules[0].config.requiredAdCount = 101
  expect(strategyFormError(document)).toContain('1–100')
  document.rules[0].config.requiredAdCount = 2
  document.rules[0].grants = ruleTemplates.episode().grants
  expect(strategyFormError(document)).toContain('不能发放其他权益')
})

test('入剧四种模式可保存并准确说明提前关闭、范围和自动重拉', () => {
  const document = defaultStrategyDocument()
  document.rules = [ruleTemplates.entry()]
  for (const scope of ['user', 'user_drama']) {
    for (const countBy of ['shown', 'completed']) {
      document.rules[0].config = { requiredAdCount: 2, scope, countBy }
      expect(strategyFormError(document)).toBe('')
      const effect = ruleEffect(document.rules[0])
      expect(effect).toContain(scope === 'user_drama' ? '每个用户的每部剧分别计数' : '所有剧共享同一用户计数')
      expect(effect).toContain(countBy === 'shown' ? '提前关闭也计入展示次数' : '提前关闭不计数')
      expect(effect).toContain('未达标自动重拉')
    }
  }
  document.rules[0].config.scope = 'drama'
  expect(strategyFormError(document)).toContain('统计范围')
  document.rules[0].config.scope = 'user'
  document.rules[0].config.countBy = null
  expect(strategyFormError(document)).toContain('达标方式')
})

test('VIP 入剧开关缺省关闭，启用后仅作为广告 VIP 规则生效', () => {
  const document = defaultStrategyDocument()
  document.rules = [ruleTemplates.vip()]
  const rule = document.rules[0]
  expect(rule.config.requireBeforePlayback).toBeUndefined()
  expect(strategyFormError(document)).toBe('')
  rule.config.requireBeforePlayback = true
  expect(strategyFormError(document)).toBe('')
  expect(ruleEffect(rule)).toContain('入剧前必须领取 VIP，若同时启用入剧广告则先完成入剧广告')
  rule.config.requireBeforePlayback = 'true'
  expect(strategyFormError(document)).toContain('入剧强制领取仅支持广告 VIP')
  document.rules = [ruleTemplates.episode()]
  document.rules[0].config.requireBeforePlayback = true
  expect(strategyFormError(document)).toContain('入剧强制领取仅支持广告 VIP')
})

test('VIP 入剧倒计时可选且限制为 0–300 秒，关闭强弹或其他广告规则不能使用', () => {
  const document = defaultStrategyDocument()
  document.rules = [ruleTemplates.vip()]
  const rule = document.rules[0]
  rule.config.requireBeforePlayback = true
  expect(strategyFormError(document)).toBe('')
  expect(ruleEffect(rule)).toContain('立即自动拉起 VIP 广告')
  for (const seconds of [0, 1, 300]) {
    rule.config.entryAdCountdownSeconds = seconds
    expect(strategyFormError(document)).toBe('')
  }
  expect(ruleEffect(rule)).toContain('倒计时 300 秒，后台暂停')
  for (const seconds of [-1, 301, 1.5, null, '5']) {
    rule.config.entryAdCountdownSeconds = seconds
    expect(strategyFormError(document)).toContain('VIP 入剧自动拉起倒计时')
  }
  rule.config.entryAdCountdownSeconds = 5
  rule.config.requireBeforePlayback = false
  expect(strategyFormError(document)).toContain('须开启入剧强制领取 VIP')
  document.rules = [ruleTemplates.episode()]
  document.rules[0].config.entryAdCountdownSeconds = 0
  expect(strategyFormError(document)).toContain('VIP 入剧自动拉起倒计时')
})

test('重复编码与非订阅付费周期被拒绝，定时组合权益可保存', () => {
  const document = defaultStrategyDocument()
  document.rules.push(structuredClone(document.rules[0]))
  expect(strategyFormError(document)).toContain('标识')
  document.rules = [ruleTemplates.purchase()]
  document.rules[0].grants[0].config.validity = 'billing_period'
  expect(strategyFormError(document)).toContain('只有订阅')
  document.rules[0].grants[0].config = { selection: 'current_drama', validity: 'duration', durationSeconds: 3600 }
  expect(strategyFormError(document)).toBe('')
})

test('效果描述完整呈现时长、整剧更新范围与 VIP 广告权益', () => {
  const rule = ruleTemplates.purchase()
  rule.grants[0].config = { selection: 'current_drama', includeFutureEpisodes: true, validity: 'duration', durationSeconds: 7200 }
  expect(ruleEffect(rule)).toBe('购买后，解锁当前整剧（含后续更新），有效期 2 小时。')
  const vip = ruleTemplates.vip()
  expect(ruleEffect(vip)).toContain('获得当前小程序 VIP（免广告），当天有效（小程序当地时间）')
  vip.grants[0].config.adFree = false
  expect(ruleEffect(vip)).toContain('VIP（不免广告）')
  vip.config.requiredAdCount = null
  expect(ruleEffect(vip)).toBe('请补全有效配置后查看规则效果。')
})
