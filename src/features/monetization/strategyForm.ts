import type { StrategyDocument } from '../../domain'

const integer = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max

/** strategyFormError 在提交前给出可定位的运营提示，服务端仍负责最终业务校验。 */
export function strategyFormError(doc: StrategyDocument): string {
  if (doc.schemaVersion !== 1) return '此策略版本暂不支持编辑，请联系管理员升级后台。'
  if (!integer(doc.freeEpisodeCount, 0, 10000)) return '免费试看集数需为 0–10000 的整数。'
  const delay = doc.entryAdDelaySeconds ?? 0
  if (delay !== 0 && !integer(delay, 4, 300)) return '首次入剧广告延后需为 0 或 4–300 秒的整数。'
  if (doc.rules.length > 5) return '每份策略最多添加 5 条规则。'
  const codes = new Set<string>()
  for (const [i, rule] of doc.rules.entries()) {
    const prefix = `规则 ${i + 1}：`
    if (!['rewarded_ad', 'entry_rewarded_ad', 'one_time_purchase', 'subscription'].includes(rule.type)) return prefix + '暂不支持此获取方式，请联系管理员升级后台。'
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(rule.code) || codes.has(rule.code)) return prefix + '规则标识无效或重复，请联系管理员。'
    codes.add(rule.code)
    if (rule.type === 'entry_rewarded_ad') {
      if (rule.config.scope !== undefined && !['user', 'user_drama'].includes(String(rule.config.scope))) return prefix + '请选择有效的入剧统计范围。'
      if (rule.config.countBy !== undefined && !['shown', 'completed'].includes(String(rule.config.countBy))) return prefix + '请选择有效的入剧达标方式。'
      if (rule.grants.length) return prefix + '入剧广告只累计当天观看次数，不能发放其他权益。'
      if (!integer(rule.config.requiredAdCount, 1, 100)) return prefix + '入剧所需广告次数需为 1–100 的整数。'
      continue
    }
    if (!rule.grants.length || rule.grants.length > 16) return prefix + '请保留 1–16 项发放权益。'
    const vip = rule.grants.some(g => g.type === 'vip')
    const c = rule.config
    if (rule.type === 'rewarded_ad') {
      if (c.requireBeforePlayback !== undefined && (typeof c.requireBeforePlayback !== 'boolean' || !vip)) return prefix + '入剧强制领取仅支持广告 VIP 规则。'
      if (c.entryAdCountdownSeconds !== undefined && (!vip || c.requireBeforePlayback !== true || !integer(c.entryAdCountdownSeconds, 0, 300))) return prefix + 'VIP 入剧自动拉起倒计时需为 0–300 秒的整数，且须开启入剧强制领取 VIP。'
      if (c.promptOnIncomplete !== undefined && (typeof c.promptOnIncomplete !== 'boolean' || (c.promptOnIncomplete && vip))) return prefix + '未看完广告弹窗仅支持逐集广告规则。'
      if (c.incompleteAdCountdownSeconds !== undefined && (c.promptOnIncomplete !== true || !integer(c.incompleteAdCountdownSeconds, 1, 300))) return prefix + '未看完广告重看倒计时需为 1–300 秒的整数，且须开启强弹广告弹窗。'
      if (c.incompleteAdDisplayCountdownSeconds !== undefined && (c.promptOnIncomplete !== true || !integer(c.incompleteAdDisplayCountdownSeconds, 1, 300))) return prefix + '未看完广告显示倒计时需为 1–300 秒的整数，且须开启强弹广告弹窗。'
      if (c.autoUnlock !== undefined) {
        const a = c.autoUnlock as Record<string, unknown> | null
        if (!a || typeof a !== 'object' || typeof a.enabled !== 'boolean' || !integer(a.countdownSeconds, 1, 300)) return prefix + '自动解锁倒计时需为 1–300 秒的整数。'
        if (a.enabled && (vip || !rule.grants.some(g => g.type === 'episode_access'))) return prefix + '自动解锁仅支持逐集广告权益。'
        if ((a.title !== undefined && (typeof a.title !== 'string' || [...a.title].length > 255)) || (a.content !== undefined && (typeof a.content !== 'string' || [...a.content].length > 500))) return prefix + '自动解锁弹窗文案过长或格式不正确。'
      }
      if (!integer(c.requiredAdCount, 1, 10)) return prefix + '所需广告次数需为 1–10 的整数。'
      if (!integer(c.dailyRewardLimit === undefined ? 0 : c.dailyRewardLimit, 0, 10000)) return prefix + '每日上限需为 0–10000 的整数。'
      if (!vip && !integer(c.forceWatchCount === undefined ? 0 : c.forceWatchCount, 0, Number(c.requiredAdCount))) return prefix + '逐集广告不支持自动提示。'
      if (vip && Number(c.dailyRewardLimit ?? 0) > 0 && Number(c.dailyRewardLimit) < Number(c.requiredAdCount)) return prefix + '每日上限不能少于获得 VIP 所需广告次数。'
      if (!vip && c.requiredAdCount !== 1) return prefix + '剧集广告每次观看一次。'
      if (vip && rule.grants.some(g => g.type !== 'vip' || g.config.validity !== 'day')) return prefix + '广告 VIP 只能发放当天 VIP 权益。'
      for (const [key, limit] of [['title', 255], ['content', 500], ['failureMessage', 500]] as const) {
        if (c[key] !== undefined && (typeof c[key] !== 'string' || [...String(c[key])].length > limit)) return prefix + '广告展示文案过长或格式不正确。'
      }
    } else if (!/^[a-zA-Z0-9_-]{1,64}$/.test(String(c.productCode ?? ''))) return prefix + '请填写商品编码，使用 1–64 位字母、数字、下划线或横线。'
    for (const grant of rule.grants) {
      if (!['episode_access', 'drama_access', 'vip'].includes(grant.type)) return prefix + '暂不支持此权益类型。'
      if (grant.type === 'episode_access' && !integer(grant.config.count, 1, 10000)) return prefix + '解锁集数需为 1–10000 的整数。'
      if (!['unlimited', 'day', 'duration', 'billing_period'].includes(String(grant.config.validity))) return prefix + '请选择权益有效期。'
      if (grant.config.validity === 'billing_period' && rule.type !== 'subscription') return prefix + '只有订阅可使用订阅周期有效期。'
      if (grant.config.validity === 'duration' && !integer(grant.config.durationSeconds, 1, 315360000)) return prefix + '权益时长需为 1–315360000 秒。'
    }
  }
  return ''
}
