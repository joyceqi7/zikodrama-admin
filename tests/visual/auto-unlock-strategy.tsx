/** 仅用于桌面和移动视口检查真实规则表单，不调用任何运营 API。 */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider, Form } from 'antd'
import { StrategyRuleEditor } from '../../src/features/monetization/StrategyRuleEditor'
import { ruleTemplates } from '../../src/unlockStrategies'

/** Preview 展示真实配置控件，编辑仅保存在当前测试页面内。 */
export function Preview() {
  const [rule, setRule] = useState(() => ({ ...ruleTemplates.episode(), config: { requiredAdCount: 1, dailyRewardLimit: 0, promptOnIncomplete: true, incompleteAdCountdownSeconds: 3, incompleteAdDisplayCountdownSeconds: 5, autoUnlock: { enabled: true, countdownSeconds: 5, title: 'Keep unlocking?', content: 'Cancel to start watching your unlocked episode.' } } }))
  return <ConfigProvider theme={{ token: { motion: false } }}><main style={{ maxWidth: 1000, margin: 'auto', padding: 20 }}><Form layout="vertical"><StrategyRuleEditor rule={rule} index={0} ruleCount={1} strategyEnabled disabled={false} bound onChange={next => setRule(next as typeof rule)} onMove={() => {}} onRemove={() => {}} /></Form></main></ConfigProvider>
}
createRoot(document.getElementById('root')!).render(<Preview />)
