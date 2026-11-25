import { ConfigProvider } from 'antd'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { OperationsApi } from '../../api'
import type { Application } from '../../domain'
import { AdConfiguration } from './AdConfiguration'

const application: Application = { subjectId:'1',
  monetizationMode: 'IAA',
  id: '9007199254740993',
    name: 'Indonesia Drama',
  logoUrl: 'https://cdn.example.test/previous-logo.png',
  tiktokAppId: '7637420375425239060', clientKey: 'client-key', secretRef: 'TIKTOK_CLIENT_SECRET_ID',

  regionCode: 'ID', timeZone: 'Asia/Jakarta',
  complianceBaseUrl: 'https://legal.example.test',
  adUnits: { rewardedVideo: ['episode-ad'], interstitial: ['launch-interstitial'] },
  status: 'active', createdAt: '', updatedAt: '',
}

function setup(options: { application?: Application; canUpdate?: boolean } = {}) {
  const updateApplication = vi.fn(async (_id, input) => ({ ...(options.application ?? application), ...input }))
  const onChanged = vi.fn()
  const notify = vi.fn()
  const onDraftChange = vi.fn()
  const api = { updateApplication } as unknown as OperationsApi
  const result = render(<ConfigProvider theme={{ token: { motion: false } }}><AdConfiguration api={api} application={options.application ?? application} loading={false} canUpdate={options.canUpdate ?? true} onChanged={onChanged} onDraftChange={onDraftChange} notify={notify} /></ConfigProvider>)
  return { ...result, api, updateApplication, onChanged, notify, onDraftChange }
}

test('保存单个广告位保持原数组合同且不改变其他应用配置', async () => {
  const { updateApplication } = setup({ application: { ...application, monetizationMode: 'IAP' } })
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.queryByLabelText('名称')).not.toBeInTheDocument()
  expect(dialog.queryByText('TikTok 与 BytePlus 授权')).not.toBeInTheDocument()
  expect(dialog.getByRole('textbox', { name: '激励视频 code 1' })).toHaveValue('episode-ad')
  const rewardedInput = dialog.getByRole('textbox', { name: '激励视频 code 1' })
  fireEvent.change(rewardedInput, { target: { value: 'new-reward' } })
  fireEvent.click(dialog.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(updateApplication).toHaveBeenCalledWith(application.id, expect.objectContaining({
    name: application.name, clientKey: application.clientKey, logoUrl: application.logoUrl,
    regionCode: 'ID', timeZone: 'Asia/Jakarta', complianceBaseUrl: application.complianceBaseUrl,
    adUnits: { rewardedVideo: ['new-reward'], interstitial: ['launch-interstitial'] }, monetizationMode: 'IAP',
  })))
})
test('广告位保存失败记录实际错误并保留输入供重试', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    const { updateApplication, notify, onChanged } = setup()
    updateApplication.mockRejectedValueOnce(new Error('test conflict'))
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.any(String), 'error'))
    expect(screen.getByRole('textbox', { name: '激励视频 code 1' })).toHaveValue('episode-ad')
    expect(onChanged).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('save application ad units failed', { error: 'test conflict' })
  } finally { log.mockRestore() }
})
test('多个激励 code 分别展示，新增删除后按原数组合同保存', async () => {
  const { updateApplication, onDraftChange } = setup({ application: { ...application, status: 'disabled', adUnits: { rewardedVideo: ['episode-ad', 'vip-ad'], interstitial: [] } } })
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByRole('textbox', { name: '激励视频 code 1' })).toHaveValue('episode-ad')
  expect(dialog.getByRole('textbox', { name: '激励视频 code 2' })).toHaveValue('vip-ad')
  fireEvent.click(dialog.getByRole('button', { name: '添加激励广告位' }))
  fireEvent.change(dialog.getByRole('textbox', { name: '激励视频 code 3' }), { target: { value: '9007199254740993' } })
  fireEvent.click(dialog.getByRole('button', { name: '删除广告位 1' }))
  expect(onDraftChange).toHaveBeenLastCalledWith(true, false)
  expect(dialog.getByRole('textbox', { name: '激励视频 code 1' })).toHaveValue('vip-ad')
  fireEvent.click(dialog.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(updateApplication).toHaveBeenCalledWith(application.id, expect.objectContaining({ adUnits: { rewardedVideo: ['vip-ad', '9007199254740993'], interstitial: [] } })))
})

test('独立输入框保存时裁剪空格、去空及去重，并回显规范化结果', async () => {
  const { updateApplication } = setup({ application: { ...application, status: 'disabled', adUnits: { rewardedVideo: [' episode-ad ', '', 'episode-ad', '9007199254740993'], interstitial: [] } } })
  fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(updateApplication).toHaveBeenCalledWith(application.id, expect.objectContaining({ adUnits: { rewardedVideo: ['episode-ad', '9007199254740993'], interstitial: [] } })))
  expect(screen.getAllByRole('textbox', { name: /激励视频 code/ })).toHaveLength(2)
  expect(screen.getByRole('textbox', { name: '激励视频 code 2' })).toHaveValue('9007199254740993')
})

test('二十个输入框后不可再新增，删除一行后恢复新增能力', async () => {
  setup({ application: { ...application, adUnits: { rewardedVideo: Array.from({ length: 20 }, (_, i) => `ad-${i}`), interstitial: ['interstitial'] } } })
  expect(screen.getByRole('button', { name: '添加激励广告位' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '删除广告位 10' }))
  expect(screen.getByRole('button', { name: '添加激励广告位' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: '添加激励广告位' }))
  expect(screen.getAllByRole('textbox', { name: /激励视频 code/ })).toHaveLength(20)
  expect(screen.getByRole('button', { name: '添加激励广告位' })).toBeDisabled()
})

test('历史超限配置和单项过长仍在表单入口拒绝', async () => {
  const { updateApplication } = setup({ application: { ...application, adUnits: { rewardedVideo: Array.from({ length: 21 }, (_, i) => `ad-${i}`), interstitial: ['interstitial'] } } })
  fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
  expect(await screen.findByText('激励视频最多配置 20 个 code')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '删除广告位 21' }))
  fireEvent.change(screen.getByRole('textbox', { name: '激励视频 code 1' }), { target: { value: 'a'.repeat(256) } })
  fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
  expect(await screen.findByText('每个 code 最多 255 个字符')).toBeInTheDocument()
  expect(updateApplication).not.toHaveBeenCalled()
})

test('插屏旧多值仍要求明确选择，激励多值可原样保留', async () => {
  const { updateApplication } = setup({ application: { ...application, adUnits: { rewardedVideo: ['ad-a', 'ad-b'], interstitial: ['i-a', 'i-b'] } } })
  fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
  expect(await screen.findByText('请确认该类型保留的 code')).toBeInTheDocument()
  expect(updateApplication).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('textbox', { name: '插屏 code' }), { target: { value: 'i-a' } })
  fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(updateApplication).toHaveBeenCalledWith(application.id, expect.objectContaining({ adUnits: { rewardedVideo: ['ad-a', 'ad-b'], interstitial: ['i-a'] } })))
})
test('停用应用可清空 code 暂存配置', async () => {
  const { updateApplication } = setup({ application: { ...application, status: 'disabled' } })
  fireEvent.change(screen.getByRole('textbox', { name: '激励视频 code 1' }), { target: { value: '  ' } })
  fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(updateApplication).toHaveBeenCalledWith(application.id, expect.objectContaining({ adUnits: { rewardedVideo: [], interstitial: ['launch-interstitial'] } })))
})
test('已启用应用不能清空任一种广告位', async () => {
  const { updateApplication } = setup()
  fireEvent.change(screen.getByRole('textbox', { name: '插屏 code' }), { target: { value: ' ' } })
  fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
  expect(await screen.findByText('已启用的应用必须配置插屏 code')).toBeInTheDocument()
  expect(updateApplication).not.toHaveBeenCalled()
})

test('只读权限可以查看广告位但无法保存', () => {
  setup({ canUpdate: false })
  expect(screen.getByRole('textbox', { name: '激励视频 code 1' })).toBeDisabled()
  expect(screen.getByRole('button', { name: /保\s*存/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: '添加激励广告位' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '删除广告位 1' })).toBeDisabled()
})

test('切换应用按新应用重建表单，保存只更新当前应用', async () => {
  const ctx = setup()
  fireEvent.change(screen.getByRole('textbox', { name: '激励视频 code 1' }), { target: { value: 'unsaved-first' } })
  expect(ctx.onDraftChange).toHaveBeenLastCalledWith(true, false)
  const second = { ...application, id: 'second', name: 'Second', adUnits: { rewardedVideo: ['second-reward'], interstitial: ['second-launch'] } }
  ctx.rerender(<AdConfiguration key={second.id} api={ctx.api} application={second} loading={false} canUpdate onChanged={ctx.onChanged} notify={ctx.notify} />)
  expect(screen.getByRole('textbox', { name: '激励视频 code 1' })).toHaveValue('second-reward')
  fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(ctx.updateApplication).toHaveBeenCalledWith('second', expect.objectContaining({ adUnits: second.adUnits })))
})

test('删除最后一行不会让已启用的广告应用保存空集合', async () => {
  const { updateApplication } = setup()
  fireEvent.click(screen.getByRole('button', { name: '删除广告位 1' }))
  fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
  expect(await screen.findByText('已启用的应用必须配置激励视频 code')).toBeInTheDocument()
  expect(updateApplication).not.toHaveBeenCalled()
})
