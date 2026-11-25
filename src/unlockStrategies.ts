import type { ApplicationMonetizationMode } from './applications'
import type { StrategyDocument, UnlockRule } from './domain'
import { reportOperationFailure } from './operationErrors'

/** 规则模板只辅助编辑，保存时由服务端类型策略完成最终校验。 */
export const ruleTemplates: Record<string, () => UnlockRule> = {
  entry: () => ({ code: 'entry_ad', type: 'entry_rewarded_ad', enabled: true, config: { requiredAdCount: 3 }, grants: [] }),
  episode: () => ({ code: 'ad_unlock', type: 'rewarded_ad', enabled: true, config: { requiredAdCount: 1, dailyRewardLimit: 0 }, grants: [{ type: 'episode_access', config: { selection: 'next_locked_episodes', count: 1, validity: 'unlimited' } }] }),
  vip: () => ({ code: 'ad_vip', type: 'rewarded_ad', enabled: true, config: { requiredAdCount: 3, dailyRewardLimit: 0, forceWatchCount: 0, delaySeconds: 0, title: '', content: '', failureMessage: '' }, grants: [{ type: 'vip', config: { scope: 'application', adFree: true, validity: 'day' } }] }),
  purchase: () => ({ code: 'drama_purchase', type: 'one_time_purchase', enabled: false, config: { productCode: 'drama_access' }, grants: [{ type: 'drama_access', config: { selection: 'current_drama', includeFutureEpisodes: false, validity: 'unlimited' } }] }),
  subscription: () => ({ code: 'vip_subscription', type: 'subscription', enabled: false, config: { productCode: 'vip_monthly' }, grants: [{ type: 'vip', config: { scope: 'application', adFree: true, validity: 'billing_period' } }] }),
}

/** unlockWayKey 将规则归一为后台允许配置一次的五种解锁方式。 */
export function unlockWayKey(rule: UnlockRule): keyof typeof ruleTemplates | '' {
  if (rule.type === 'entry_rewarded_ad') return 'entry'
  if (rule.type === 'one_time_purchase') return 'purchase'
  if (rule.type === 'subscription') return 'subscription'
  if (rule.type !== 'rewarded_ad') return ''
  return rule.grants.some((grant) => grant.type === 'vip') ? 'vip' : 'episode'
}

/** defaultStrategyDocument 默认试看一集、每次广告解锁一集；IAA/混合以广告开始，IAP 以单次购买开始。 */
export function defaultStrategyDocument(mode: ApplicationMonetizationMode = 'IAA'): StrategyDocument {
  return { schemaVersion: 1, enabled: true, freeEpisodeCount: 1, rules: [mode === 'IAP' ? ruleTemplates.purchase() : ruleTemplates.episode()] }
}

/** reportStrategyFailure 记录经过脱敏的实际错误，并返回统一用户提示，不输出规则或表单。 */
export function reportStrategyFailure(operation: string, error: unknown): string {
  return reportOperationFailure(`解锁策略操作失败（${operation}）`, error)
}

/** ruleAllowedForMode 限制获取方式，停用规则也必须属于当前应用模式。 */
export function ruleAllowedForMode(mode: ApplicationMonetizationMode, type: string): boolean {
  return type === 'rewarded_ad' || type === 'entry_rewarded_ad' ? mode !== 'IAP' : (type === 'one_time_purchase' || type === 'subscription') && mode !== 'IAA'
}

/** strategyModeError 保留旧规则供用户调整，不静默删除与应用模式冲突的配置。 */
export function strategyModeError(document: StrategyDocument, mode: ApplicationMonetizationMode): string {
  const index = document.rules.findIndex(rule => !ruleAllowedForMode(mode, rule.type))
  return index < 0 ? '' : `规则 ${index + 1}：当前小程序为 ${mode}，请移除不支持的解锁方式后保存。`
}
