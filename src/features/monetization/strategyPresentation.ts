import type { StrategyDocument, UnlockRule } from '../../domain'
import { strategyFormError } from './strategyForm'

/** ruleSummary 将规则转换为运营可直接核对的用户获得效果。 */
export function ruleSummary(rule: UnlockRule): string {
  if (rule.type === 'entry_rewarded_ad') return `${rule.config.scope === 'user_drama' ? '每人每部剧每天' : '每人每天'}${rule.config.countBy === 'shown' ? '展示' : '完整观看'} ${rule.config.requiredAdCount ?? '—'} 次入剧广告`
  const rewards = rule.grants.map(grant => {
    if (grant.type === 'episode_access') return `解锁后续 ${grant.config.count ?? '—'} 集`
    if (grant.type === 'drama_access') return '解锁当前整剧'
    if (grant.type === 'vip') return grant.config.validity === 'day' ? '获得当天 VIP' : '获得 VIP'
    return '获得权益'
  }).join('，')
  if (rule.type === 'rewarded_ad') return `看 ${rule.config.requiredAdCount ?? 1} 次广告，${rule.grants.some(grant => grant.type === 'vip') ? '手动领取后' : ''}${rewards}${rule.config.requireBeforePlayback === true ? '；入剧前必须领取，若同时启用入剧广告则先完成入剧广告' : ''}`
  return `${rule.type === 'subscription' ? '订阅后' : '购买后'}${rewards}`
}

/** strategySummary 只汇总启用的广告规则，尚未接入的支付不误报为已生效。 */
export function strategySummary(document: StrategyDocument): string {
  if (!document.enabled) return '策略已停用，不提供新的解锁入口'
  const free = document.freeEpisodeCount > 0 ? `前 ${document.freeEpisodeCount} 集免费` : '不提供免费试看'
  const rules = document.rules.filter(rule => rule.enabled && (rule.type === 'rewarded_ad' || rule.type === 'entry_rewarded_ad'))
  return [free, ...rules.map(ruleSummary)].join('；')
}

/** ruleName 根据获取方式和权益类型提供可读名称，不改变规则编码。 */
export function ruleName(rule: UnlockRule): string {
  if (rule.type === 'entry_rewarded_ad') return '入剧广告'
  if (rule.type === 'subscription') return '订阅 VIP'
  if (rule.type === 'one_time_purchase') return '单次购买'
  if (rule.type !== 'rewarded_ad') return '暂不支持的规则'
  if (rule.grants.some(grant => grant.type === 'vip')) return '广告 VIP'
  if (rule.grants.every(grant => grant.type === 'episode_access')) return '逐集广告'
  if (rule.grants.every(grant => grant.type === 'drama_access')) return '整剧广告'
  return '广告解锁'
}

/** ruleEffect 说明完整权益范围与有效期；无效草稿不展示可能误导的领取效果。 */
export function ruleEffect(rule: UnlockRule): string {
  if (strategyFormError({ schemaVersion: 1, enabled: true, freeEpisodeCount: 0, rules: [rule] })) return '请补全有效配置后查看规则效果。'
  if (rule.type === 'entry_rewarded_ad') {
    const perDrama = rule.config.scope === 'user_drama'
    const shown = rule.config.countBy === 'shown'
    return `当前应用的观众每天进入${perDrama ? '每部短剧' : '任一短剧'}播放前，需累计${shown ? '成功展示' : '完整观看并结算'} ${rule.config.requiredAdCount} 次入剧广告；${perDrama ? '每个用户的每部剧分别计数，达标后当天进入该剧' : '所有剧共享同一用户计数，达标后当天其他播放'}无需重复完成。${shown ? '提前关闭也计入展示次数，未达标自动重拉。' : '提前关闭不计数，未达标自动重拉。'}`
  }
  const rewards = rule.grants.map(grant => {
    const config = grant.config
    const reward = grant.type === 'episode_access' ? `解锁后续 ${config.count} 集`
      : grant.type === 'drama_access' ? `解锁当前整剧${config.includeFutureEpisodes ? '（含后续更新）' : '（不含后续更新）'}`
        : `获得当前小程序 VIP${config.adFree ? '（免广告）' : '（不免广告）'}`
    const seconds = Number(config.durationSeconds)
    const duration = seconds % 86400 === 0 ? `${seconds / 86400} 天` : seconds % 3600 === 0 ? `${seconds / 3600} 小时` : `${seconds} 秒`
    const validity = config.validity === 'unlimited' ? '永久有效' : config.validity === 'day' ? '当天有效（小程序当地时间）' : config.validity === 'billing_period' ? '在订阅周期内有效' : `有效期 ${duration}`
    return `${reward}，${validity}`
  }).join('；')
  const action = rule.type === 'rewarded_ad' ? `${rule.grants.some(grant => grant.type === 'vip') ? '当天累计看完' : '看完'} ${rule.config.requiredAdCount} 次广告` : rule.type === 'subscription' ? '订阅后' : '购买后'
  const vipEntry = rule.config.requireBeforePlayback === true
    ? `；入剧前必须领取 VIP，若同时启用入剧广告则先完成入剧广告；${Number(rule.config.entryAdCountdownSeconds ?? 0) > 0 ? `每次自动拉起 VIP 广告前倒计时 ${rule.config.entryAdCountdownSeconds} 秒，后台暂停` : '立即自动拉起 VIP 广告'}` : ''
  return `${action}，${rule.type === 'rewarded_ad' && rule.grants.some(grant => grant.type === 'vip') ? '手动领取后' : ''}${rewards}${vipEntry}。`
}
