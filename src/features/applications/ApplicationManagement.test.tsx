import { ConfigProvider } from 'antd'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { ApplicationDramaAuthorizationPage, ApplicationDramaAuthorizationQuery, OperationsApi } from '../../api'
import { ApiError } from '../../api'
import type { Application } from '../../applications'
import { ApplicationManagement } from './ApplicationManagement'

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

const availableDramas: ApplicationDramaAuthorizationPage['items'] = [
  { id: '201', title: '测试短剧 A', status: 'none' },
  { id: '202', title: '测试短剧 B', status: 'none' },
]
const trackedDramas: ApplicationDramaAuthorizationPage['items'] = [
  { id: '203', title: '已授权短剧', status: 'authorized' },
  { id: '204', title: '处理中短剧', status: 'pending' },
  { id: '205', title: '失败短剧', status: 'attention_required' },
  { id: '206', title: '发布方短剧', status: 'owner' },
]

function setup(options: { application?: Application; applications?: Application[]; canCreate?: boolean; canUpdate?: boolean; canDistribute?: boolean; onRefresh?: () => Promise<void>; listApplicationDramaAuthorizations?: (id: string, input: ApplicationDramaAuthorizationQuery) => Promise<ApplicationDramaAuthorizationPage>; authorizeApplicationDramas?: (id: string, dramaIds: string[]) => Promise<{ authorizedCount: number }> } = {}) {
  const createApplication = vi.fn(async (input) => ({ ...application, ...input, status: 'disabled' as const }))
  const updateApplication = vi.fn(async (_id, input) => ({ ...application, ...input }))
  const listApplicationDramaAuthorizations = vi.fn(options.listApplicationDramaAuthorizations ?? (async (_id, input) => {
    const items = input.view === 'available' ? availableDramas : trackedDramas
    return { items, total: items.length }
  }))
  const authorizeApplicationDramas = vi.fn(options.authorizeApplicationDramas ?? (async () => ({ authorizedCount: 1 })))
  const onChanged = vi.fn()
  const notify = vi.fn()
  render(<ConfigProvider theme={{ token: { motion: false } }}><ApplicationManagement subjectId="1"
    api={{ createApplication, updateApplication, listApplicationDramaAuthorizations, authorizeApplicationDramas } as unknown as OperationsApi}
    applications={options.applications ?? [options.application ?? application]}
    canCreate={options.canCreate ?? true}
    canUpdate={options.canUpdate ?? true}
    canDistribute={options.canDistribute ?? true}
    loading={false} onRefresh={options.onRefresh ?? vi.fn(async () => undefined)} onChanged={onChanged} notify={notify}
  /></ConfigProvider>)
  return { createApplication, updateApplication, listApplicationDramaAuthorizations, authorizeApplicationDramas, onChanged, notify }
}

test('授权弹窗分栏展示真实状态，只有未授权短剧可提交', async () => {
  const { listApplicationDramaAuthorizations, authorizeApplicationDramas, notify } = setup({ applications: [application, { ...application, id: '2', name: '停用应用', status: 'disabled' }, { ...application, id: '3', name: '未配置应用', clientKey: '' }] })
  expect(screen.getByRole('button', { name: '授权短剧给 停用应用' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '授权短剧给 未配置应用' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '授权短剧给 Indonesia Drama' }))
  const dialog = within(await screen.findByRole('dialog'))
  expect(dialog.getByText('为 Indonesia Drama 授权短剧')).toBeInTheDocument()
  await waitFor(() => expect(listApplicationDramaAuthorizations).toHaveBeenCalledWith(application.id, { page: 1, pageSize: 20, view: 'available', query: '' }))
  await waitFor(() => expect(listApplicationDramaAuthorizations).toHaveBeenCalledWith(application.id, { page: 1, pageSize: 20, view: 'tracked', query: '' }))
  expect(dialog.getByText('未授权短剧（2）')).toBeInTheDocument()
  expect(dialog.getByText('授权状态（4）')).toBeInTheDocument()
  expect(await dialog.findByText('已授权短剧')).toBeInTheDocument()
  expect(dialog.getByText('已授权')).toBeInTheDocument()
  expect(dialog.getByText('处理中')).toBeInTheDocument()
  expect(dialog.getByText('需人工处理')).toBeInTheDocument()
  expect(dialog.getByText('发布方')).toBeInTheDocument()
  expect(dialog.queryByRole('checkbox', { name: '选择 已授权短剧' })).not.toBeInTheDocument()
  expect(dialog.getByRole('button', { name: '授权所选（0）' })).toBeDisabled()
  expect(authorizeApplicationDramas).not.toHaveBeenCalled()
  fireEvent.click(await dialog.findByRole('checkbox', { name: '选择 测试短剧 A' }))
  fireEvent.click(dialog.getByRole('button', { name: '授权所选（1）' }))
  await waitFor(() => expect(authorizeApplicationDramas).toHaveBeenCalledWith(application.id, ['201']))
  await waitFor(() => expect(notify).toHaveBeenCalledWith('已将 1 部短剧完成授权'))
})

test('没有分发权限时禁用授权按钮', () => {
  const forbidden = setup({ canDistribute: false })
  fireEvent.click(screen.getByRole('button', { name: '授权短剧给 Indonesia Drama' }))
  expect(forbidden.authorizeApplicationDramas).not.toHaveBeenCalled()
})

test.each([{ name: '桌面', width: 1440 }, { name: '手机', width: 390 }])('$name视口展示完整 Client Key', ({ width }) => {
  vi.stubGlobal('innerWidth', width)
  try {
    setup({ applications: [application, { ...application, id: '2', name: '未配置应用', clientKey: '' }] })
    expect(screen.getByText('client-key')).toBeVisible()
    expect(screen.queryByText('已配置')).not.toBeInTheDocument()
    expect(width >= 992 ? screen.getByRole('table') : screen.getByRole('list', { name: '应用列表' })).toHaveTextContent('未配置')
  } finally {
    vi.unstubAllGlobals()
  }
})

test('未授权栏跨页勾选保留原选择，取消弹窗不会提交授权', async () => {
  const { authorizeApplicationDramas } = setup({ listApplicationDramaAuthorizations: async (_id, { page, view }) => view === 'available' ? { items: [availableDramas[page - 1]], total: 21 } : { items: trackedDramas, total: trackedDramas.length } })
  fireEvent.click(screen.getByRole('button', { name: '授权短剧给 Indonesia Drama' }))
  const dialog = within(await screen.findByRole('dialog'))
  fireEvent.click(await dialog.findByRole('checkbox', { name: '选择 测试短剧 A' }))
  fireEvent.click(dialog.getByTitle('Next Page'))
  fireEvent.click(await dialog.findByRole('checkbox', { name: '选择 测试短剧 B' }))
  expect(dialog.getByText(/已选择 2 部/)).toBeInTheDocument()
  fireEvent.click(dialog.getByRole('button', { name: /取\s*消/ }))
  expect(authorizeApplicationDramas).not.toHaveBeenCalled()
})

test('授权请求失败时记录诊断并提示统一错误', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    setup({ authorizeApplicationDramas: async () => { throw new Error('test queue failure') } })
    fireEvent.click(screen.getByRole('button', { name: '授权短剧给 Indonesia Drama' }))
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(await dialog.findByRole('checkbox', { name: '选择 测试短剧 A' }))
    fireEvent.click(dialog.getByRole('button', { name: '授权所选（1）' }))
    await waitFor(() => expect(log).toHaveBeenCalledWith('authorize application dramas failed', { error: 'test queue failure' }))
    expect(dialog.getByRole('alert')).toBeInTheDocument()
  } finally {
    log.mockRestore()
  }
})

test('授权状态读取失败时阻止提交，重试后恢复两栏', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  let failed = true
  try {
    const { authorizeApplicationDramas } = setup({ listApplicationDramaAuthorizations: async (_id, { view }) => {
      if (view === 'tracked' && failed) throw new Error('authorization read unavailable')
      const items = view === 'tracked' ? trackedDramas : availableDramas
      return { items, total: items.length }
    } })
    fireEvent.click(screen.getByRole('button', { name: '授权短剧给 Indonesia Drama' }))
    const dialog = within(await screen.findByRole('dialog'))
    await waitFor(() => expect(log).toHaveBeenCalledWith('load tracked application drama authorizations failed', { error: 'authorization read unavailable' }))
    expect(dialog.getByRole('button', { name: '授权所选（0）' })).toBeDisabled()
    expect(dialog.queryByText('已授权短剧')).not.toBeInTheDocument()
    failed = false
    fireEvent.click(dialog.getByRole('button', { name: '重试加载授权状态' }))
    expect(await dialog.findByText('已授权短剧')).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('checkbox', { name: '选择 测试短剧 A' }))
    expect(dialog.getByRole('button', { name: '授权所选（1）' })).toBeEnabled()
    expect(authorizeApplicationDramas).not.toHaveBeenCalled()
  } finally {
    log.mockRestore()
  }
})

test.each([{ name: '桌面', width: 1440 }, { name: '手机', width: 390 }])('$name视口显示短剧选择弹窗', async ({ width }) => {
  vi.stubGlobal('innerWidth', width)
  try {
    setup()
    const button = screen.getByRole('button', { name: '授权短剧给 Indonesia Drama' })
    expect(button).toBeVisible()
    expect(button).toBeEnabled()
    expect(width >= 992 ? screen.getByRole('table') : screen.getByRole('list', { name: '应用列表' })).toBeInTheDocument()
    fireEvent.click(button)
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('为 Indonesia Drama 授权短剧')).toBeInTheDocument()
    expect(await dialog.findByRole('checkbox', { name: '选择 测试短剧 A' })).toBeInTheDocument()
    expect(dialog.getByText('测试短剧 A')).toBeInTheDocument()
    expect(dialog.getByText('已授权短剧')).toBeInTheDocument()
    expect(dialog.queryByRole('checkbox', { name: '选择 已授权短剧' })).not.toBeInTheDocument()
  } finally {
    vi.unstubAllGlobals()
  }
})

test('应用筛选组合名称、完整长 ID 与状态，空结果可重置', async () => {
  const { updateApplication } = setup({ applications: [application, { ...application, id: '9007199254740994', name: 'Second Drama', tiktokAppId: '90071992547409931234', status: 'disabled', clientKey: '', adUnits: { rewardedVideo: [], interstitial: [] } }] })
  const query = screen.getByRole('textbox', { name: '搜索应用' })
  fireEvent.change(query, { target: { value: ' INDONESIA ' } })
  expect(screen.getByRole('button', { name: '编辑 Indonesia Drama' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '编辑 Second Drama' })).not.toBeInTheDocument()
  fireEvent.change(query, { target: { value: '90071992547409931234' } })
  expect(screen.getByRole('button', { name: '编辑 Second Drama' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '编辑 Indonesia Drama' })).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('找到 1 个，共 2 个应用')
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '应用状态' }))
  fireEvent.click(await screen.findByText('启用', { selector: '.ant-select-item-option-content' }))
  expect(screen.getByText('未找到匹配的应用')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重置筛选' }))
  expect(query).toHaveValue('')
  expect(screen.getByRole('status')).toHaveTextContent('共 2 个应用')
  expect(screen.getByRole('button', { name: '编辑 Indonesia Drama' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '编辑 Second Drama' })).toBeInTheDocument()
  expect(updateApplication).not.toHaveBeenCalled()
})

test('翻页后筛选回到第一页，清空条件恢复完整目录', () => {
  setup({ applications: Array.from({ length: 21 }, (_, index) => ({ ...application, id: String(index + 1), tiktokAppId: `fixture-${index + 1}`, name: `测试应用 ${index + 1}` })) })
  fireEvent.click(screen.getByTitle('Next Page'))
  expect(screen.getByRole('button', { name: '编辑 测试应用 21' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '编辑 测试应用 1' })).not.toBeInTheDocument()
  const query = screen.getByRole('textbox', { name: '搜索应用' })
  fireEvent.change(query, { target: { value: '测试应用 1' } })
  expect(screen.getByRole('button', { name: '编辑 测试应用 1' })).toBeInTheDocument()
  fireEvent.change(query, { target: { value: '' } })
  expect(screen.getByRole('status')).toHaveTextContent('共 21 个应用')
  expect(screen.getByRole('button', { name: '编辑 测试应用 1' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '编辑 测试应用 21' })).not.toBeInTheDocument()
})

test('新建提交完整分发身份及默认广告变现模式，不展示或提交应用环境', async () => {
  const { createApplication, onChanged } = setup()
  fireEvent.click(screen.getByRole('button', { name: '新建应用' }))
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByRole('textbox', { name: '激励视频 code 1' })).toBeInTheDocument()
  expect(dialog.getByRole('textbox', { name: '插屏 code' })).toBeInTheDocument()
  for (const removed of ['应用代码', '应用 Logo', '市场配置', '合规', 'TikTok 与 BytePlus 授权', '广告位编码']) {
    expect(dialog.queryByText(removed)).not.toBeInTheDocument()
  }
  expect(dialog.queryByLabelText('应用环境')).not.toBeInTheDocument()
  fireEvent.change(dialog.getByRole('textbox', { name: '应用 ID' }), { target: { value: ' 7637420375425239061 ' } })
  fireEvent.change(dialog.getByRole('textbox', { name: '名称' }), { target: { value: ' New Drama ' } })
  fireEvent.change(dialog.getByRole('textbox', { name: 'Client Key' }), { target: { value: ' new-client-key ' } })
  fireEvent.change(dialog.getByLabelText('Client Secret'), { target: { value: 'new-app-secret' } })
  fireEvent.click(dialog.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(createApplication).toHaveBeenCalledWith({ subjectId: '1', tiktokAppId: '7637420375425239061', name: 'New Drama', clientKey: 'new-client-key', clientSecret: 'new-app-secret', monetizationMode: 'IAA', playbackProvider:'tiktok_minis', adUnits: { rewardedVideo: [], interstitial: [] } }))
  expect(onChanged).toHaveBeenCalledOnce()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

test.each([{ name: '桌面', width: 1440 }, { name: '手机', width: 390 }])('$name视口创建独立 VePlayer 应用时只提交播放模式，不提交配置引用', async ({ width }) => {
  vi.stubGlobal('innerWidth', width)
  try {
    const { createApplication, onChanged } = setup()
    fireEvent.click(screen.getByRole('button', { name: '新建应用' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.mouseDown(dialog.getByRole('combobox', { name: '播放器' }))
    fireEvent.click(await screen.findByText('独立 VePlayer', { selector: '.ant-select-item-option-content' }))
    fireEvent.change(dialog.getByRole('textbox', { name: '应用 ID' }), { target: { value: '0007637420375425239060' } })
    fireEvent.change(dialog.getByRole('textbox', { name: '名称' }), { target: { value: 'Direct Drama' } })
    fireEvent.change(dialog.getByRole('textbox', { name: 'Client Key' }), { target: { value: 'direct-client-key' } })
    fireEvent.change(dialog.getByLabelText('Client Secret'), { target: { value: 'test-only-secret' } })
    expect(dialog.queryByRole('textbox', { name: '播放器配置引用' })).not.toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: /保\s*存/ }))
    await waitFor(() => expect(createApplication).toHaveBeenCalledWith({ subjectId: '1', tiktokAppId: '0007637420375425239060', name: 'Direct Drama', clientKey: 'direct-client-key', clientSecret: 'test-only-secret', monetizationMode: 'IAA', playbackProvider: 'byteplus_web', adUnits: { rewardedVideo: [], interstitial: [] } }))
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ playbackProvider: 'byteplus_web' }))
  } finally { vi.unstubAllGlobals() }
})

test('新建拒绝空白 ID 和名称', async () => {
  const { createApplication } = setup()
  fireEvent.click(screen.getByRole('button', { name: '新建应用' }))
  fireEvent.change(screen.getByRole('textbox', { name: '应用 ID' }), { target: { value: '   ' } })
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /保\s*存/ }))
  expect(await screen.findByText('请输入 TikTok 应用 ID')).toBeInTheDocument()
  expect(await screen.findByText('请输入应用名称')).toBeInTheDocument()
  expect(createApplication).not.toHaveBeenCalled()
})

test.each([{ name: '桌面', width: 1440 }, { name: '手机', width: 390 }])('$name视口切换现有应用到直连，保留身份和广告位并提交原修订', async ({ width }) => {
  vi.stubGlobal('innerWidth', width)
  try {
    const { updateApplication } = setup()
    fireEvent.click(screen.getByRole('button', { name: '编辑 Indonesia Drama' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('combobox', { name: '播放器' })).toBeEnabled()
    expect(dialog.getByText('新版 Mini 上线后可修改，切换后使用目标通道的已上线短剧。')).toBeInTheDocument()
    fireEvent.mouseDown(dialog.getByRole('combobox', { name: '播放器' }))
    fireEvent.click(await screen.findByText('独立 VePlayer', { selector: '.ant-select-item-option-content' }))
    expect(dialog.queryByRole('textbox', { name: '播放器配置引用' })).not.toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: /保\s*存/ }))
    await waitFor(() => expect(updateApplication).toHaveBeenCalledWith(application.id, expect.objectContaining({
      playbackProvider: 'byteplus_web', playbackRevision: 0,
      tiktokAppId: application.tiktokAppId, clientKey: application.clientKey, adUnits: application.adUnits, monetizationMode: application.monetizationMode,
    })))
    expect(updateApplication.mock.calls[0][1]).not.toHaveProperty('playbackProfileKey')
  } finally { vi.unstubAllGlobals() }
})

test('直连应用可以切回官方，提交最新修订并去掉直连引用', async () => {
  const { updateApplication } = setup({ application: { ...application, playbackProvider: 'byteplus_web', playbackRevision: 7 } })
  fireEvent.click(screen.getByRole('button', { name: '编辑 Indonesia Drama' }))
  const dialog = within(screen.getByRole('dialog'))
  fireEvent.mouseDown(dialog.getByRole('combobox', { name: '播放器' }))
  fireEvent.click(await screen.findByText('TikTok 官方播放器', { selector: '.ant-select-item-option-content' }))
  expect(dialog.queryByRole('textbox', { name: '播放器配置引用' })).not.toBeInTheDocument()
  fireEvent.click(dialog.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(updateApplication).toHaveBeenCalledWith(application.id, expect.objectContaining({ playbackProvider: 'tiktok_minis', playbackRevision: 7 })))
})

test.each([false, true])('直连应用资料保存仅维护播放模式和原修订，表单内往返切换=%s', async (switchBack) => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  try {
    const { updateApplication } = setup({ application: { ...application, playbackProvider: 'byteplus_web', playbackRevision: 9 } })
    expect(screen.queryByRole('button', { name: '播放器配置' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '编辑 Indonesia Drama' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.queryByRole('textbox', { name: '播放器配置引用' })).not.toBeInTheDocument()
    if (switchBack) {
      fireEvent.mouseDown(dialog.getByRole('combobox', { name: '播放器' }))
      fireEvent.click(await screen.findByText('TikTok 官方播放器', { selector: '.ant-select-item-option-content' }))
      fireEvent.mouseDown(dialog.getByRole('combobox', { name: '播放器' }))
      fireEvent.click(await screen.findByText('独立 VePlayer', { selector: '.ant-select-item-option-content' }))
    }
    fireEvent.change(dialog.getByRole('textbox', { name: '名称' }), { target: { value: '更新直连应用名称' } })
    fireEvent.click(dialog.getByRole('button', { name: /保\s*存/ }))
    await waitFor(() => expect(updateApplication).toHaveBeenCalledWith(application.id, expect.objectContaining({
      name: '更新直连应用名称', playbackProvider: 'byteplus_web', playbackRevision: 9,
    })))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(log).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  } finally { log.mockRestore(); warn.mockRestore() }
})

test('服务端拒绝切换时保留输入与修订，明确提示并允许再次提交', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  try {
    const { updateApplication, onChanged, notify } = setup()
    updateApplication.mockRejectedValueOnce(new ApiError('playback profile is invalid', 400, 'invalid_request'))
    fireEvent.click(screen.getByRole('button', { name: '编辑 Indonesia Drama' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.mouseDown(dialog.getByRole('combobox', { name: '播放器' }))
    fireEvent.click(await screen.findByText('独立 VePlayer', { selector: '.ant-select-item-option-content' }))
    const save = dialog.getByRole('button', { name: /保\s*存/ })
    fireEvent.click(save)
    await waitFor(() => expect(notify).toHaveBeenCalledWith('填写的信息有误，请检查必填项和格式后重试', 'error'))
    expect(onChanged).not.toHaveBeenCalled()
    expect(dialog.getByRole('combobox', { name: '播放器' }).closest('.ant-select')).toHaveTextContent('独立 VePlayer')
    expect(warn).toHaveBeenCalledWith('save application failed', { error: 'playback profile is invalid' })
    fireEvent.click(save)
    await waitFor(() => expect(updateApplication).toHaveBeenCalledTimes(2))
    for (const [, input] of updateApplication.mock.calls) {
      expect(input).toMatchObject({ playbackProvider: 'byteplus_web', playbackRevision: 0 })
    }
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onChanged).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(log).not.toHaveBeenCalled()
  } finally { log.mockRestore(); warn.mockRestore() }
})

test('应用编辑权限包含播放器选择，保存直连资料时携带原通道与修订', async () => {
  const { updateApplication } = setup({ application: { ...application, playbackProvider: 'byteplus_web', playbackRevision: 4 } })
  fireEvent.click(screen.getByRole('button', { name: '编辑 Indonesia Drama' }))
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByRole('combobox', { name: '播放器' })).toBeEnabled()
  expect(dialog.queryByRole('textbox', { name: '播放器配置引用' })).not.toBeInTheDocument()
  fireEvent.change(dialog.getByRole('textbox', { name: '名称' }), { target: { value: '更新名称' } })
  fireEvent.click(dialog.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(updateApplication).toHaveBeenCalledOnce())
  const input = updateApplication.mock.calls[0][1]
  expect(input.playbackProvider).toBe('byteplus_web')
  expect(input).not.toHaveProperty('playbackProfileKey')
  expect(input.playbackRevision).toBe(4)
  expect(input.adUnits).toEqual(application.adUnits)
})

test('应用编辑回显广告位，保存名称时保留历史配置和广告位', async () => {
  const { updateApplication } = setup()
  fireEvent.click(screen.getByRole('button', { name: '编辑 Indonesia Drama' }))
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByRole('textbox', { name: '应用 ID' })).toBeDisabled()
  expect(dialog.getByRole('textbox', { name: 'Client Key' })).toBeDisabled()
  expect(dialog.queryByText('激励视频广告位编码')).not.toBeInTheDocument()
  expect(dialog.queryByText('市场配置')).not.toBeInTheDocument()
  expect(dialog.queryByText('合规')).not.toBeInTheDocument()
  expect(dialog.queryByLabelText('应用 Logo')).not.toBeInTheDocument()
  expect(dialog.getByRole('textbox', { name: '激励视频 code 1' })).toBeInTheDocument()
  expect(dialog.getByRole('textbox', { name: '插屏 code' })).toBeInTheDocument()
  for (const label of ['Client Secret 环境变量', 'BytePlus Account ID', 'BytePlus VOD Space']) {
    expect(dialog.queryByLabelText(label)).not.toBeInTheDocument()
  }
  expect(dialog.queryByText('TikTok 与 BytePlus 授权')).not.toBeInTheDocument()
  expect(dialog.getByText('TikTok 发布方凭据在「主体管理」维护；BytePlus 账号和空间在「配置管理」维护。')).toBeInTheDocument()
  fireEvent.change(dialog.getByRole('textbox', { name: '名称' }), { target: { value: 'Renamed Drama' } })
  fireEvent.click(dialog.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(updateApplication).toHaveBeenCalledWith(application.id, expect.objectContaining({
    name: 'Renamed Drama', logoUrl: application.logoUrl, regionCode: 'ID', timeZone: 'Asia/Jakarta',
    complianceBaseUrl: application.complianceBaseUrl, adUnits: application.adUnits, tiktokAppId: application.tiktokAppId,
    secretRef: application.secretRef, monetizationMode: 'IAA',
  })))
})

test('历史停用应用可以补齐 Client Key', () => {
  setup({ application: { ...application, clientKey: '', status: 'disabled' } })
  fireEvent.click(screen.getByRole('button', { name: '编辑 Indonesia Drama' }))
  expect(screen.getByRole('textbox', { name: 'Client Key' })).toBeEnabled()
})



test('应用与广告位入口遵守创建和编辑权限', () => {
  setup({ canCreate: false, canUpdate: false })
  expect(screen.queryByRole('button', { name: '新建应用' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '编辑 Indonesia Drama' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '广告位 Indonesia Drama' })).toBeDisabled()
})




test('没有应用级凭据时可用自己的 Client Key 启用，成功路径不记录失败日志', async () => {
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const warningLog = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  try {
    const { updateApplication } = setup({ application: { ...application, status: 'disabled', clientKey: '', secretRef: '', } })
    fireEvent.click(screen.getByRole('button', { name: '编辑 Indonesia Drama' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.mouseDown(dialog.getByRole('combobox', { name: '状态' }))
    fireEvent.click(await screen.findByText('启用'))
    const clientKey = dialog.getByRole('textbox', { name: 'Client Key' })
    await waitFor(() => expect(clientKey).toBeRequired())
    fireEvent.click(dialog.getByRole('button', { name: /保\s*存/ }))
    expect(await dialog.findByText('请输入当前应用的 Client Key')).toBeInTheDocument()
    expect(updateApplication).not.toHaveBeenCalled()
    fireEvent.change(dialog.getByRole('textbox', { name: 'Client Key' }), { target: { value: 'target-app-key' } })
    fireEvent.click(dialog.getByRole('button', { name: /保\s*存/ }))
    await waitFor(() => expect(updateApplication).toHaveBeenCalledWith(application.id, expect.objectContaining({ status: 'active', clientKey: 'target-app-key', secretRef: '', })))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(errorLog).not.toHaveBeenCalled()
    expect(warningLog).not.toHaveBeenCalled()
  } finally { errorLog.mockRestore(); warningLog.mockRestore() }
})

test('应用保存失败保留输入并记录脱敏错误，再次保存可以恢复', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    const { updateApplication, notify } = setup()
    updateApplication.mockRejectedValueOnce(new Error('connection refused token=private-token https://media.example/private'))
    fireEvent.click(screen.getByRole('button', { name: '编辑 Indonesia Drama' }))
    const dialog = within(screen.getByRole('dialog'))
    const name = dialog.getByRole('textbox', { name: '名称' })
    const save = dialog.getByRole('button', { name: /保\s*存/ })
    fireEvent.change(name, { target: { value: 'Updated app' } })
    fireEvent.click(save)
    await waitFor(() => expect(notify).toHaveBeenCalledWith('操作失败，请稍后重试', 'error'))
    expect(name).toHaveValue('Updated app')
    expect(log).toHaveBeenCalledWith('save application failed', { error: 'connection refused token=[已脱敏] [URL 已脱敏]' })
    fireEvent.click(save)
    await waitFor(() => expect(updateApplication).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(log).toHaveBeenCalledTimes(1)
  } finally { log.mockRestore() }
})

test('应用列表刷新失败有诊断和用户提示，不产生未处理的异步异常', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    const { notify } = setup({ onRefresh: vi.fn(async () => { throw new Error('list connection refused') }) })
    fireEvent.click(screen.getByRole('button', { name: /刷\s*新/ }))
    await waitFor(() => expect(notify).toHaveBeenCalledWith('操作失败，请稍后重试', 'error'))
    expect(log).toHaveBeenCalledWith('refresh applications failed', { error: 'list connection refused' })
  } finally { log.mockRestore() }
})


test('缺少广告位的停用应用不能直接启用', async () => {
  const { updateApplication } = setup({ application: { ...application, status: 'disabled', adUnits: { rewardedVideo: ['reward'], interstitial: [] } } })
  fireEvent.click(screen.getByRole('button', { name: '编辑 Indonesia Drama' }))
  const dialog = within(screen.getByRole('dialog'))
  fireEvent.mouseDown(dialog.getByRole('combobox', { name: '状态' }))
  fireEvent.click(await screen.findByText('启用', { selector: '.ant-select-item-option-content' }))
  fireEvent.click(dialog.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(dialog.getAllByText('请在「应用管理」的广告位配置中填写一个插屏 code').length).toBeGreaterThan(1))
  expect(updateApplication).not.toHaveBeenCalled()
})

// 以真实下拉操作验证三种配置在编辑表单中的选择和提交。
test.each([
  ['IAA', 'IAA（广告变现）'], ['IAP', 'IAP（内购变现）'], ['IAA+IAP', 'IAA+IAP（混合变现）'],
] as const)('应用支持选择 %s，编辑保存后保留身份和广告配置', async (mode, label) => {
  const { updateApplication } = setup({ application: { ...application, monetizationMode: 'IAP' } })
  expect(screen.getByText('IAP')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '编辑 Indonesia Drama' }))
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByText('IAP（内购变现）')).toBeInTheDocument()
  fireEvent.mouseDown(dialog.getByRole('combobox', { name: '变现模式' }))
  fireEvent.click(await screen.findByText(label, { selector: '.ant-select-item-option-content' }))
  fireEvent.click(dialog.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(updateApplication).toHaveBeenCalledWith(application.id, expect.objectContaining({
    monetizationMode: mode, tiktokAppId: application.tiktokAppId, adUnits: application.adUnits,
  })))
})

test('内购应用无需广告位即可启用', async () => {
  const { updateApplication } = setup({ application: { ...application, monetizationMode: 'IAP', status: 'disabled', adUnits: { rewardedVideo: [], interstitial: [] } } })
  fireEvent.click(screen.getByRole('button', { name: '编辑 Indonesia Drama' }))
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '状态' }))
  fireEvent.click(await screen.findByText('启用', { selector: '.ant-select-item-option-content' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(updateApplication).toHaveBeenCalledWith(application.id, expect.objectContaining({ monetizationMode: 'IAP', status: 'active' })))
})

test('新建缺少 Client Key 时阻止提交，允许暂不填写广告位', async () => {
  const { createApplication } = setup()
  fireEvent.click(screen.getByRole('button', { name: '新建应用' }))
  const dialog = within(screen.getByRole('dialog'))
  fireEvent.change(dialog.getByRole('textbox', { name: '应用 ID' }), { target: { value: '7637420375425239061' } })
  fireEvent.change(dialog.getByRole('textbox', { name: '名称' }), { target: { value: 'New Drama' } })
  fireEvent.change(dialog.getByRole('textbox', { name: 'Client Key' }), { target: { value: '   ' } })
  fireEvent.click(dialog.getByRole('button', { name: /保\s*存/ }))
  expect(await dialog.findByText('请输入当前应用的 Client Key')).toBeInTheDocument()
  expect(createApplication).not.toHaveBeenCalled()
  expect(dialog.getByRole('textbox', { name: '激励视频 code 1' })).toHaveValue('')
})

test('新建缺少 Secret 拒绝提交，密码输入不回显已存密钥', async () => {
  const { createApplication } = setup()
  fireEvent.click(screen.getByRole('button', { name: '新建应用' }))
  const dialog = within(screen.getByRole('dialog'))
  fireEvent.change(dialog.getByLabelText('应用 ID'), { target: { value: '12345' } })
  fireEvent.change(dialog.getByLabelText('名称'), { target: { value: 'New App' } })
  fireEvent.change(dialog.getByLabelText('Client Key'), { target: { value: 'key' } })
  expect(dialog.getByLabelText('Client Secret')).toHaveAttribute('type', 'password')
  fireEvent.click(dialog.getByRole('button', { name: /保\s*存/ }))
  expect(await dialog.findByText('请输入当前应用的 Client Secret')).toBeInTheDocument()
  expect(createApplication).not.toHaveBeenCalled()
})

test('已配置密钥不回显，编辑可轮换且重新打开时清空输入', async () => {
  const { updateApplication } = setup({ application: { ...application, clientSecretConfigured: true } })
  fireEvent.click(screen.getByRole('button', { name: '编辑 Indonesia Drama' }))
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByLabelText('Client Secret')).toHaveValue('')
  fireEvent.change(dialog.getByLabelText('Client Secret'), { target: { value: 'rotated-secret' } })
  fireEvent.click(dialog.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(updateApplication).toHaveBeenCalledWith(application.id, expect.objectContaining({ clientSecret: 'rotated-secret' })))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: '编辑 Indonesia Drama' }))
  expect(screen.getByLabelText('Client Secret')).toHaveValue('')
})

test('新建应用同时提交多激励和单插屏广告位，去空去重且保留长编码', async () => {
  const { createApplication } = setup({ canUpdate: false })
  fireEvent.click(screen.getByRole('button', { name: '新建应用' }))
  const dialog = within(screen.getByRole('dialog'))
  fireEvent.change(dialog.getByLabelText('应用 ID'), { target: { value: '000123' } })
  fireEvent.change(dialog.getByLabelText('名称'), { target: { value: '广告应用' } })
  fireEvent.change(dialog.getByLabelText('Client Key'), { target: { value: 'new-key' } })
  fireEvent.change(dialog.getByLabelText('Client Secret'), { target: { value: 'test-secret' } })
  fireEvent.change(dialog.getByLabelText('激励视频 code 1'), { target: { value: ' reward-a ' } })
  fireEvent.click(dialog.getByRole('button', { name: '添加激励广告位' }))
  fireEvent.change(dialog.getByLabelText('激励视频 code 2'), { target: { value: 'reward-a' } })
  fireEvent.click(dialog.getByRole('button', { name: '添加激励广告位' }))
  fireEvent.change(dialog.getByLabelText('激励视频 code 3'), { target: { value: '9007199254740993' } })
  fireEvent.change(dialog.getByLabelText('插屏 code'), { target: { value: ' launch-ad ' } })
  fireEvent.click(dialog.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(createApplication).toHaveBeenCalledWith(expect.objectContaining({
    tiktokAppId: '000123', adUnits: { rewardedVideo: ['reward-a', '9007199254740993'], interstitial: ['launch-ad'] },
  })))
})

test('应用编辑可在同一次保存中补齐广告位并启用', async () => {
  const { updateApplication } = setup({ application: { ...application, status: 'disabled', adUnits: { rewardedVideo: [], interstitial: [] } } })
  fireEvent.click(screen.getByRole('button', { name: '编辑 Indonesia Drama' }))
  const dialog = within(screen.getByRole('dialog'))
  fireEvent.mouseDown(dialog.getByRole('combobox', { name: '状态' }))
  fireEvent.click(await screen.findByText('启用', { selector: '.ant-select-item-option-content' }))
  fireEvent.change(dialog.getByLabelText('激励视频 code 1'), { target: { value: 'reward-new' } })
  fireEvent.change(dialog.getByLabelText('插屏 code'), { target: { value: 'interstitial-new' } })
  fireEvent.click(dialog.getByRole('button', { name: /保\s*存/ }))
  await waitFor(() => expect(updateApplication).toHaveBeenCalledWith(application.id, expect.objectContaining({
    status: 'active', adUnits: { rewardedVideo: ['reward-new'], interstitial: ['interstitial-new'] },
  })))
})

test.each([{ name: '桌面', width: 1440 }, { name: '手机', width: 390 }])('$name列表广告位按钮只更新所选应用，保留其身份和资料', async ({ width }) => {
  vi.stubGlobal('innerWidth', width)
  try {
    const second = { ...application, id: '2', name: '第二个应用', adUnits: { rewardedVideo: ['second-reward'], interstitial: ['second-launch'] } }
    const { updateApplication, onChanged } = setup({ applications: [application, second] })
    fireEvent.click(screen.getByRole('button', { name: '广告位 第二个应用' }))
    const modal = screen.getByRole('dialog')
    expect(modal.closest('.ant-modal-centered')).not.toBeNull()
    const dialog = within(modal)
    expect(dialog.getByText('广告位 · 第二个应用')).toBeInTheDocument()
    expect(dialog.queryByLabelText('名称')).not.toBeInTheDocument()
    expect(dialog.getByLabelText('激励视频 code 1')).toHaveValue('second-reward')
    fireEvent.change(dialog.getByLabelText('激励视频 code 1'), { target: { value: 'updated-second' } })
    fireEvent.click(dialog.getByRole('button', { name: /保\s*存/ }))
    await waitFor(() => expect(updateApplication).toHaveBeenCalledWith('2', expect.objectContaining({
      name: second.name, tiktokAppId: second.tiktokAppId, timeZone: second.timeZone,
      adUnits: { rewardedVideo: ['updated-second'], interstitial: ['second-launch'] },
    })))
    expect(updateApplication).toHaveBeenCalledOnce()
    expect(application.adUnits).toEqual({ rewardedVideo: ['episode-ad'], interstitial: ['launch-interstitial'] })
    expect(onChanged).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  } finally { vi.unstubAllGlobals() }
})

test('关闭广告位弹窗先保护未保存输入，放弃后再次打开回显已保存数据', async () => {
  const { updateApplication } = setup()
  fireEvent.click(screen.getByRole('button', { name: '广告位 Indonesia Drama' }))
  const dialog = within(screen.getByRole('dialog'))
  fireEvent.change(dialog.getByLabelText('激励视频 code 1'), { target: { value: 'unsaved' } })
  fireEvent.click(dialog.getByRole('button', { name: /取\s*消/ }))
  expect(await screen.findByText('放弃广告位的修改？')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
  expect(dialog.getByLabelText('激励视频 code 1')).toHaveValue('unsaved')
  fireEvent.click(dialog.getByRole('button', { name: 'Close' }))
  fireEvent.click(await screen.findByRole('button', { name: '放弃修改' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(updateApplication).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '广告位 Indonesia Drama' }))
  expect(screen.getByLabelText('激励视频 code 1')).toHaveValue('episode-ad')
})


test('应用编辑不再包含审核版本或开关，普通保存不回写审核配置', async () => {
 const {updateApplication}=setup({application:{...application,miniReview:{version:'1.0.1',enabled:true,revision:9}}})
 fireEvent.click(screen.getByRole('button',{name:'编辑 Indonesia Drama'}))
 expect(screen.queryByLabelText('审核版本号')).not.toBeInTheDocument()
 expect(screen.queryByRole('switch',{name:'审核开关'})).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('名称'),{target:{value:'新名称'}})
 fireEvent.click(screen.getByRole('button',{name:/保\s*存/}))
 await waitFor(()=>expect(updateApplication).toHaveBeenCalled())
 expect(updateApplication.mock.calls[0][1]).not.toHaveProperty('miniReview')
})


test('新建应用使用居中弹窗，不展示应用身份确认提示', async () => {
 setup()
 fireEvent.click(screen.getByRole('button',{name:'新建应用'}))
 const dialog=screen.getByRole('dialog')
 expect(within(dialog).getByText('新建应用',{exact:true})).toBeInTheDocument()
 expect(dialog.closest('.ant-modal-wrap')).not.toBeNull()
 expect(dialog.closest('.ant-drawer')).toBeNull()
 expect(within(dialog).getByLabelText('应用 ID')).toBeInTheDocument()
 expect(within(dialog).getByLabelText('Client Key')).toBeInTheDocument()
 expect(within(dialog).getByLabelText('Client Secret')).toBeInTheDocument()
 expect(screen.queryByText('请确认应用 ID、Client Key 和 Client Secret 属于同一个 TikTok 应用。')).not.toBeInTheDocument()
 expect(screen.queryByText('应用 ID 和 Client Key 保存后不可更换。应用默认停用，广告位可稍后配置。')).not.toBeInTheDocument()
 fireEvent.click(within(dialog).getByRole('button',{name:/取\s*消/}))
 await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})
