import { ConfigProvider } from 'antd'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { OperationsApi } from '../../api'
import type { Application } from '../../applications'
import type { ApplicationStrategy, UnlockRule, UnlockStrategy } from '../../domain'
import { ruleTemplates } from '../../unlockStrategies'
import { UnlockStrategyManagement } from './UnlockStrategyManagement'

const strategy: UnlockStrategy = {
  id: 'app-strategy', revision: 7, createdAt: '', updatedAt: '',
  document: { schemaVersion: 1, enabled: true, freeEpisodeCount: 3, rules: [{ code: 'ad', type: 'rewarded_ad', enabled: true, config: { requiredAdCount: 1, dailyRewardLimit: 0 }, grants: [{ type: 'episode_access', config: { selection: 'next_locked_episodes', count: 2, validity: 'unlimited' } }] }] },
}

const app: Application = { subjectId:'1',
  monetizationMode: 'IAA', id: '9007199254740993', name: 'app-a', tiktokAppId: 'app-a', logoUrl: '', clientKey: 'client', secretRef: '', regionCode: 'GLOBAL', timeZone: 'UTC', complianceBaseUrl: '', status: 'active', adUnits: { rewardedVideo: ['reward'], interstitial: ['interstitial'] }, createdAt: '', updatedAt: '',
}

function setup(options: { canUpdate?: boolean; application?: Application; configured?: boolean; rules?: UnlockRule[]; interstitialEnabled?: boolean } = {}) {
  const application = options.application ?? app
  const configuredStrategy = { ...strategy, document: { ...strategy.document, ...(options.rules ? { rules: options.rules } : {}), ...(options.interstitialEnabled !== undefined ? { interstitialEnabled: options.interstitialEnabled } : {}) } }
  const snapshot: ApplicationStrategy = { applicationId: application.id, monetizationMode: application.monetizationMode, strategy: options.configured === false ? null : configuredStrategy, rules: {} }
  const api = {
    getApplicationStrategy: vi.fn(async () => snapshot),
    saveApplicationStrategy: vi.fn(async (input) => ({ ...snapshot, strategy: { ...(snapshot.strategy ?? strategy), document: input.document }, rules: input.rules })),
  } as unknown as OperationsApi
  const notify = vi.fn()
  render(<ConfigProvider theme={{ token: { motion: false } }}><UnlockStrategyManagement api={api} application={application} canUpdate={options.canUpdate ?? true} notify={notify} /></ConfigProvider>)
  return { api, notify }
}

describe('当前应用唯一解锁策略面板', () => {
  it('直接展示配置面板，不再出现名称、新建或策略列表', async () => {
    setup()
    expect(await screen.findByLabelText('免费试看集数')).toHaveValue('3')
    expect(screen.queryByLabelText('策略名称')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '新建策略' })).not.toBeInTheDocument()
    expect(screen.getByText(/每种解锁方式最多配置一个/)).toBeInTheDocument()
  })

  it('保存只提交文档和商品映射', async () => {
    const { api } = setup()
    await screen.findByLabelText('免费试看集数')
    fireEvent.change(screen.getByLabelText('免费试看集数'), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
    await waitFor(() => expect(api.saveApplicationStrategy).toHaveBeenCalledWith({ document: { ...strategy.document, freeEpisodeCount: 6 }, rules: {} }, app.id))
  })

  it('首次入剧广告延后校验秒数并保存到当前应用策略', async () => {
    const { api } = setup()
    const delay = await screen.findByLabelText('首次入剧广告延后')
    expect(delay).toHaveValue('0')
    fireEvent.change(delay, { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
    expect(await screen.findByText('首次入剧广告延后需为 0 或 4–300 秒的整数。')).toBeInTheDocument()
    expect(api.saveApplicationStrategy).not.toHaveBeenCalled()
    fireEvent.change(delay, { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('免费试看集数'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
    await waitFor(() => expect(api.saveApplicationStrategy).toHaveBeenCalledWith({
      document: { ...strategy.document, freeEpisodeCount: 0, entryAdDelaySeconds: 5 }, rules: {},
    }, app.id))
  })

  it('逐集广告强弹开关默认关闭，开启后随策略文档保存', async () => {
    const { api } = setup()
    const toggle = await screen.findByRole('switch', { name: '规则 1 强弹广告弹窗' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('规则 1 重看倒计时')).toHaveValue('3')
    fireEvent.change(screen.getByLabelText('规则 1 显示倒计时'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
    await waitFor(() => expect(api.saveApplicationStrategy).toHaveBeenCalledWith({
      document: { ...strategy.document, rules: [{ ...strategy.document.rules[0], config: { ...strategy.document.rules[0].config, promptOnIncomplete: true, incompleteAdDisplayCountdownSeconds: 5 } }] },
      rules: {},
    }, app.id))
  })

  it('强弹开关重新关闭后省略新字段，保留旧服务端可识别的配置', async () => {
    const { api } = setup()
    const toggle = await screen.findByRole('switch', { name: '规则 1 强弹广告弹窗' })
    fireEvent.click(toggle)
    fireEvent.change(screen.getByLabelText('规则 1 重看倒计时'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('规则 1 显示倒计时'), { target: { value: '7' } })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
    await waitFor(() => expect(api.saveApplicationStrategy).toHaveBeenCalledWith({ document: strategy.document, rules: {} }, app.id))
  })

  it('一种解锁方式添加后不再提供重复入口', async () => {
    setup({ application: { ...app, monetizationMode: 'IAA+IAP' } })
    await screen.findByLabelText('免费试看集数')
    fireEvent.click(screen.getByRole('button', { name: /添加解锁方式/ }))
    expect(screen.queryByRole('menuitem', { name: '添加逐集广告' })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('menuitem', { name: '添加广告 VIP' }))
    fireEvent.click(screen.getByRole('button', { name: /添加解锁方式/ }))
    expect(screen.queryByRole('menuitem', { name: '添加广告 VIP' })).not.toBeInTheDocument()
  })

  const modeCases = [
    { mode: 'IAA', ways: ['entry', 'episode', 'vip'], missing: 'vip', label: '添加广告 VIP' },
    { mode: 'IAP', ways: ['purchase', 'subscription'], missing: 'subscription', label: '添加订阅 VIP' },
    { mode: 'IAA+IAP', ways: ['entry', 'episode', 'vip', 'purchase', 'subscription'], missing: 'subscription', label: '添加订阅 VIP' },
  ] as const

  it.each(modeCases)('$mode 配齐当前模式的方式后禁用添加并提示，停用规则也计入配置', async ({ mode, ways }) => {
    const { api } = setup({ application: { ...app, monetizationMode: mode }, rules: ways.map(way => ({ ...ruleTemplates[way](), enabled: false })) })
    const add = await screen.findByRole('button', { name: /添加解锁方式/ })
    expect(add).toBeDisabled()
    expect(screen.getByText('当前变现模式的解锁方式均已配置')).toBeInTheDocument()
    fireEvent.click(add)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(api.saveApplicationStrategy).not.toHaveBeenCalled()
  })

  it.each(modeCases)('$mode 仅提供当前模式缺少的方式，添加最后一项后立即禁用', async ({ mode, ways, missing, label }) => {
    const { api } = setup({ application: { ...app, monetizationMode: mode }, rules: ways.filter(way => way !== missing).map(way => ruleTemplates[way]()) })
    const add = await screen.findByRole('button', { name: /添加解锁方式/ })
    expect(add).toBeEnabled()
    expect(screen.queryByText('当前变现模式的解锁方式均已配置')).not.toBeInTheDocument()
    fireEvent.click(add)
    const option = await screen.findByRole('menuitem', { name: label })
    expect(screen.getAllByRole('menuitem')).toHaveLength(1)
    fireEvent.click(option)
    expect(add).toBeDisabled()
    expect(screen.getByText('当前变现模式的解锁方式均已配置')).toBeInTheDocument()
    expect(api.saveApplicationStrategy).not.toHaveBeenCalled()
  })

  it('配齐后删除一种方式可重新添加，补回后再次禁用且不产生重复规则', async () => {
    const { api } = setup({ rules: ['entry', 'episode', 'vip'].map(way => ruleTemplates[way]()) })
    const add = await screen.findByRole('button', { name: /添加解锁方式/ })
    expect(add).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '删除规则 1' }))
    expect(add).toBeEnabled()
    expect(screen.queryByText('当前变现模式的解锁方式均已配置')).not.toBeInTheDocument()
    fireEvent.click(add)
    fireEvent.click(await screen.findByRole('menuitem', { name: '添加入剧广告' }))
    expect(add).toBeDisabled()
    expect(screen.getAllByRole('button', { name: /选择规则/ })).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
    await waitFor(() => expect(api.saveApplicationStrategy).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.saveApplicationStrategy).mock.calls[0][0].document.rules.map(rule => rule.code)).toEqual(['ad_unlock', 'ad_vip', 'entry_ad'])
  })

  it('未配置时按应用模式直接生成默认面板', async () => {
    setup({ configured: false, application: { ...app, monetizationMode: 'IAP', adUnits: { rewardedVideo: [], interstitial: [] } } })
    expect(await screen.findByLabelText('规则 1 商品编码')).toHaveValue('drama_access')
    expect(screen.queryByRole('button', { name: '新建策略' })).not.toBeInTheDocument()
  })

  it('缺少广告位时阻止保存启用的广告方式', async () => {
    const { api } = setup({ application: { ...app, adUnits: { rewardedVideo: ['reward'], interstitial: [] } } })
    await screen.findByLabelText('免费试看集数')
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
    expect(await screen.findByText(/启用前请先在应用配置中配齐激励视频候选广告位和一个插屏广告位/)).toBeInTheDocument()
    expect(api.saveApplicationStrategy).not.toHaveBeenCalled()
  })

  it('保存失败保留面板草稿并允许重试', async () => {
    const { api } = setup()
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(api.saveApplicationStrategy).mockRejectedValueOnce(new Error('unavailable token=secret'))
    await screen.findByLabelText('免费试看集数')
    fireEvent.change(screen.getByLabelText('免费试看集数'), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
    expect(await screen.findByText('操作失败，请稍后重试')).toBeInTheDocument()
    expect(screen.getByLabelText('免费试看集数')).toHaveValue('8')
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
    await waitFor(() => expect(api.saveApplicationStrategy).toHaveBeenCalledTimes(2))
    errorLog.mockRestore()
  })

  it('只读权限可查看但不能修改或保存', async () => {
    setup({ canUpdate: false })
    expect(await screen.findByLabelText('免费试看集数')).toBeDisabled()
    expect(screen.getByRole('button', { name: /保\s*存/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /添加解锁方式/ })).not.toBeInTheDocument()
  })

  it('读取失败显示重试入口并保留诊断日志', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const api = { getApplicationStrategy: vi.fn().mockRejectedValue(new Error('strategy read failed token=secret')) } as unknown as OperationsApi
    render(<ConfigProvider theme={{ token: { motion: false } }}><UnlockStrategyManagement api={api} application={app} canUpdate notify={vi.fn()} /></ConfigProvider>)
    expect(await screen.findByText('解锁策略加载失败')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /重\s*试/ })).toBeInTheDocument()
    expect(errorLog).toHaveBeenCalledWith('解锁策略操作失败（读取）', { error: 'strategy read failed token=[已脱敏]' })
    errorLog.mockRestore()
  })
})


it('历史 IAA 策略默认开启插屏，关闭并保存后可重新开启', async () => {
  const { api } = setup()
  const toggle = await screen.findByRole('switch', { name: '开启插屏广告' })
  expect(toggle).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByLabelText('免费试看集数')).toHaveValue('3')
  expect(screen.getByLabelText('规则 1 权益 1 解锁集数')).toHaveValue('2')
  fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(api.saveApplicationStrategy).toHaveBeenCalledWith({ document: { ...strategy.document, interstitialEnabled: false }, rules: {} }, app.id))
  expect(toggle).toHaveAttribute('aria-checked', 'false')
  fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(api.saveApplicationStrategy).toHaveBeenLastCalledWith({ document: { ...strategy.document, interstitialEnabled: true }, rules: {} }, app.id))
})

it('读取已关闭的插屏配置时保留关闭状态，无编辑权限不能切换', async () => {
  setup({ interstitialEnabled: false, canUpdate: false })
  const toggle = await screen.findByRole('switch', { name: '开启插屏广告' })
  expect(toggle).toHaveAttribute('aria-checked', 'false')
  expect(toggle).toBeDisabled()
})

it('新建 IAA 策略默认试看一集且每次解锁一集', async () => {
  const { api } = setup({ configured: false })
  expect(await screen.findByLabelText('免费试看集数')).toHaveValue('1')
  expect(screen.getByLabelText('规则 1 权益 1 解锁集数')).toHaveValue('1')
  expect(screen.getByRole('switch', { name: '开启插屏广告' })).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(api.saveApplicationStrategy).toHaveBeenCalledWith(expect.objectContaining({ document: expect.objectContaining({ freeEpisodeCount: 1, rules: [expect.objectContaining({ grants: [expect.objectContaining({ config: expect.objectContaining({ count: 1 }) })] })] }) }), app.id))
})

it('纯内购应用不展示插屏开关', async () => {
  setup({ configured: false, application: { ...app, monetizationMode: 'IAP' } })
  await screen.findByLabelText('免费试看集数')
  expect(screen.queryByRole('switch', { name: '开启插屏广告' })).not.toBeInTheDocument()
})
