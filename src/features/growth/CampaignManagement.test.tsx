import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { OperationsApi } from '../../api'
import type { Campaign, CampaignInput, Drama } from '../../domain'
import { CampaignManagement } from './CampaignManagement'

test.each(['加载', '保存', '复制'])('投放配置%s失败保留错误详情并脱敏', async (operation) => {
  const cause = new Error('依赖不可用 token=test-secret https://media.example/video')
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const campaign = { id: 'campaign-1', name: '测试投放', code: 'test', landingUrl: 'https://mini.example/test', status: 'active', dramaId: 'drama-1', episodeId: 'episode-1' } as Campaign
  const api = {
    listCampaigns: vi.fn(async () => [campaign]), listCampaignTargets: vi.fn(async () => []),
    updateCampaign: vi.fn().mockRejectedValue(cause),
  } as unknown as OperationsApi
  if (operation === '加载') api.listCampaigns = vi.fn().mockRejectedValue(cause)
  const notify = vi.fn()
  render(<CampaignManagement api={api} applicationName="应用" dramas={[]} canCreate canUpdate notify={notify} />)
  if (operation !== '加载') {
    await screen.findByText('测试投放')
    expect(errorLog).not.toHaveBeenCalled()
  }
  if (operation === '保存') {
    fireEvent.click(screen.getByRole('button', { name: '配置 测试投放' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
  }
  if (operation === '复制') {
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(cause) } })
    fireEvent.click(screen.getByRole('button', { name: '复制 测试投放 落地地址' }))
    await waitFor(() => expect(errorLog).toHaveBeenCalled())
    if (original) Object.defineProperty(navigator, 'clipboard', original)
    else Reflect.deleteProperty(navigator, 'clipboard')
  }
  await waitFor(() => expect(errorLog).toHaveBeenCalledWith(operation === '复制' ? '复制投放落地地址失败' : `${operation}投放配置失败`, { error: '依赖不可用 token=[已脱敏] [URL 已脱敏]' }))
  expect(errorLog).toHaveBeenCalledTimes(1)
  expect(notify).toHaveBeenCalledWith(expect.any(String), 'error')
  errorLog.mockRestore()
})

test('campaign management loads the selected application campaigns and opens the editor', async () => {
  const campaign: Campaign = {
    id: 'campaign-1', applicationId: 'app-id', code: 'launch_abcdef', name: 'TikTok Indonesia', landingUrl: 'https://mini.example.test/drama?campaignCode=launch_abcdef',
    externalCampaignId: '2385', externalAdGroupId: '', externalAdId: '', externalCreativeId: '',
    dramaId: 'drama-1', episodeId: 'episode-1', experimentKey: '', status: 'active', createdAt: '', updatedAt: '',
  }
  const dramas = [{
    id: 'drama-1', title: 'Shared drama', publishStatus: 'published', episodes: [{ id: 'episode-1', number: 1, title: 'Episode 1' }],
  }] as unknown as Drama[]
  const api = { listCampaigns: vi.fn(async () => [campaign]), listCampaignTargets: vi.fn(async () => dramas) } as unknown as OperationsApi
  render(<CampaignManagement api={api} applicationName="Indonesia App" dramas={dramas} canCreate canUpdate notify={vi.fn()} />)

  expect(await screen.findByText('TikTok Indonesia')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '复制 TikTok Indonesia 落地地址' })).toBeEnabled()
  expect(screen.getByText('当前 TikTok 应用：Indonesia App')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /新建投放配置/ }))
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('新建投放配置'))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).queryByRole('combobox', { name: /投放平台/ })).not.toBeInTheDocument()
  expect(dialog).not.toHaveTextContent('Meta')
  expect(within(dialog).getByRole('combobox', { name: /落地短剧/ })).toBeInTheDocument()
  expect(within(dialog).getByRole('combobox', { name: /起播剧集/ })).toBeInTheDocument()
  expect(within(dialog).queryByRole('textbox', { name: /活动代码/ })).not.toBeInTheDocument()
  expect(within(dialog).queryByRole('textbox', { name: 'Campaign ID' })).not.toBeInTheDocument()
  expect(within(dialog).queryByRole('textbox', { name: /实验键/ })).not.toBeInTheDocument()
})

test('没有可投放剧集时解释授权前置条件，不要求自填基础地址', async () => {
  const api = { listCampaigns: vi.fn(async () => []), listCampaignTargets: vi.fn(async () => []) } as unknown as OperationsApi
  render(<CampaignManagement api={api} applicationName="Indonesia App" dramas={[]} canCreate canUpdate notify={vi.fn()} />)

  fireEvent.click(await screen.findByRole('button', { name: /新建投放配置/ }))
  const dialog = screen.getByRole('dialog')
  expect(await screen.findByText('当前小程序暂无可投放剧集')).toBeInTheDocument()
  expect(screen.queryByText('请先在应用设置填写投放落地基础地址')).not.toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: '生成配置' })).toBeDisabled()
})

test('campaign configuration creation sends only the locked target and shows the generated URL', async () => {
  const created: Campaign = {
    id: 'campaign-2', applicationId: 'app-id', code: 'launch_generated', name: 'Hook A', landingUrl: 'https://mini.example.test/drama?campaignCode=launch_generated',
    externalCampaignId: '', externalAdGroupId: '', externalAdId: '', externalCreativeId: '',
    dramaId: 'drama-1', episodeId: 'episode-1', experimentKey: '', status: 'active', createdAt: '', updatedAt: '',
  }
  const dramas = [{
    id: 'drama-1', title: 'Shared drama', publishStatus: 'published', episodes: [{ id: 'episode-1', number: 1, title: 'Episode 1' }],
  }] as unknown as Drama[]
  const createCampaign = vi.fn(async (_input: CampaignInput) => created)
  const api = { listCampaigns: vi.fn(async () => []), listCampaignTargets: vi.fn(async () => dramas), createCampaign } as unknown as OperationsApi
  render(<CampaignManagement api={api} applicationName="Indonesia App" dramas={dramas} canCreate canUpdate notify={vi.fn()} />)

  fireEvent.click(await screen.findByRole('button', { name: /新建投放配置/ }))
  fireEvent.change(screen.getByRole('textbox', { name: '配置名称' }), { target: { value: 'Hook A' } })
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '落地短剧' }))
  fireEvent.click(await screen.findByText('Shared drama'))
  fireEvent.click(screen.getByRole('button', { name: '生成配置' }))

  await waitFor(() => expect(createCampaign).toHaveBeenCalledTimes(1))
  const [input] = createCampaign.mock.calls[0]
  expect(input).toMatchObject({ name: 'Hook A', dramaId: 'drama-1', episodeId: 'episode-1', status: 'active' })
  expect(input).not.toHaveProperty('code')
  expect(screen.getAllByText(created.landingUrl)).toHaveLength(2)
})

test('仅修改名称仍保留已有归因标识与实验键', async () => {
  const campaign: Campaign = {
    id: 'campaign-edit', applicationId: 'app-id', code: 'entry', name: 'Original', landingUrl: 'https://example.test/entry',
    externalCampaignId: 'external-campaign', externalAdGroupId: 'external-group', externalAdId: 'external-ad', externalCreativeId: 'external-creative',
    dramaId: 'drama-1', episodeId: 'episode-1', experimentKey: 'experiment-1', status: 'active', createdAt: '', updatedAt: '',
  }
  const dramas = [{ id: 'drama-1', title: '短剧', episodes: [{ id: 'episode-1', number: 1, title: '第一集' }] }] as Drama[]
  const updateCampaign = vi.fn(async (_id: string, input: CampaignInput) => ({ ...campaign, ...input }))
  const api = { listCampaigns: vi.fn(async () => [campaign]), listCampaignTargets: vi.fn(async () => dramas), updateCampaign } as unknown as OperationsApi
  render(<CampaignManagement api={api} applicationName="应用" dramas={dramas} canCreate canUpdate notify={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: '配置 Original' }))
  fireEvent.change(screen.getByRole('textbox', { name: '配置名称' }), { target: { value: 'Renamed' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(updateCampaign).toHaveBeenCalledWith(campaign.id, {
    code: campaign.code, name: 'Renamed', status: campaign.status, dramaId: campaign.dramaId, episodeId: campaign.episodeId,
    externalCampaignId: campaign.externalCampaignId, externalAdGroupId: campaign.externalAdGroupId,
    externalAdId: campaign.externalAdId, externalCreativeId: campaign.externalCreativeId, experimentKey: campaign.experimentKey,
  }))
})
