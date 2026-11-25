import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { Grid } from 'antd'
import { ApiError, type OperationsApi } from '../../api'
import type { Application } from '../../applications'
import type { Drama, DramaListItem, TikTokPublication } from '../../domain'
import { OfficialPublicationManagement } from './OfficialPublicationManagement'

// fixture 只模拟本地任务事实与命令结果，不连接官方平台。
function fixture(
  overrides: Partial<TikTokPublication> = {},
  rowOverrides: Partial<DramaListItem> = {},
) {
  let task: TikTokPublication | null = {
    id: '701',
    dramaId: '201',
    ownerApplicationId: '101',
    priority: 'normal',
    currentContentChanged: false,
    status: 'online',
    stage: 'done',
    reviewStatus: 2,
    platformPublishStatus: 2,
    attempts: 1,
    nextAttemptAt: '',
    createdAt: '',
    updatedAt: '',
    platformVersion: 7,
    ...overrides,
  }
  const row: DramaListItem = {
    id: '201',
    title: '官方剧',
    status: 'updating',
    year: 2026,
    coverUrl: '',
    tags: [],
    publishStatus: 'draft',
    episodeCount: 2,
    readyEpisodeCount: 2,
    onlineVersion: 7,
    authorizedApplicationCount: 1,
    ...rowOverrides,
  }
  const listRow = () => ({ ...row, publication: task || undefined })
  const queued = async () => {
    task = { ...task!, status: 'queued' }
    return task
  }
  const api = {
    listDramas: vi.fn(async () => ({ items: [listRow()], total: 1 })),
    findTikTokReleaseState: vi.fn(async () => row.officialRelease || null),
    changeTikTokRelease: vi.fn(async (_id: string, input: import('../../domain').TikTokReleaseInput) => ({ ...task!, status: input.action === 'delist' ? 'offline' as const : 'online' as const, stage: 'done' as const })),
    findTikTokPublication: vi.fn(async () => {
      if (!task) throw new ApiError('missing', 404)
      return task
    }),
    findDrama: vi.fn(
      async () =>
        ({
          ...row,
          description: '完整简介',
          language: 'en',
          dramaType: 4,
          tagIds: [],
          episodes: [],
          onlineEpisodeNumbers: [1, 2],
        }) as Drama,
    ),
    listDramaDistributions: vi.fn(async () => []),
    submitTikTokPublication: vi.fn(queued),
    submitTikTokReview: vi.fn(queued),
    retryTikTokPublication: vi.fn(queued),
    refreshTikTokReview: vi.fn(async () => {
      task = { ...task!, status: 'approved', stage: 'await_publish' }
      return task
    }),
    publishTikTokPublication: vi.fn(queued),
    unpublishDrama: vi.fn(queued),
    withdrawTikTokReview: vi.fn(queued),
    appealTikTokReview: vi.fn(queued),
  }
  const notify = vi.fn()
  const props = {
    api: api as unknown as OperationsApi,
    applications: [],
    canSync: true,
    canReview: true,
    canRelease: true,
    notify,
  }
  return {
    api,
    props,
    row,
    setTask: (next: TikTokPublication | null) => {
      task = next
    },
    getTask: () => task!,
  }
}

// confirm 从当前弹窗提交，避免与列表中的同名按钮混淆。
async function confirm(name: string) {
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: name === '下线' ? /^下\s*线$/ : name,
    }),
  )
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((value) => {
    resolve = value
  })
  return { promise, resolve }
}

test('列表分开展示旧线上与新审核状态，详情只读且没有工作台入口', async () => {
  const f = fixture({
    status: 'under_review',
    stage: 'poll_review',
    reviewStatus: 1,
  })
  render(<OfficialPublicationManagement {...f.props} />)
  expect(await screen.findByText('已上线 · V7')).toBeInTheDocument()
  expect(screen.getByText('等待 TikTok 审核')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '查询审核结果' })).toBeEnabled()
  expect(
    screen.queryByRole('button', { name: /^下\s*线$/ }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: '官方发布工作台' }),
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '查看 官方剧 发布详情' }))
  const drawer = await screen.findByRole('dialog')
  expect(
    await within(drawer).findByText('已上线 2 集 · 第 1–2 集'),
  ).toBeInTheDocument()
  expect(
    within(drawer).queryByRole('button', { name: '查询审核结果' }),
  ).not.toBeInTheDocument()
})

test('按需查看授权，不开放授权权限时没有保存入口', async () => {
  const f = fixture()
  render(
    <OfficialPublicationManagement
      {...f.props}
      canSync={false}
      canReview={false}
      canRelease={false}
    />,
  )
  fireEvent.click(
    await screen.findByRole('button', { name: '查看 官方剧 授权小程序' }),
  )
  await waitFor(() =>
    expect(f.api.listDramaDistributions).toHaveBeenCalledExactlyOnceWith('201'),
  )
  expect(
    screen.queryByRole('button', { name: '保存授权选择' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /^下\s*线$/ }),
  ).not.toBeInTheDocument()
})

test('复制旧线上投放链接使用实际选中应用，草稿不阻止复制', async () => {
  const f = fixture()
  const ensureDramaCampaign = vi.fn(async () => ({
    landingUrl: 'https://mini.example/link',
  }))
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  render(
    <OfficialPublicationManagement
      {...f.props}
      api={{ ...f.api, ensureDramaCampaign } as unknown as OperationsApi}
      applicationId="101"
      canCopyCampaign
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: '复制投放链接' }))
  await waitFor(() =>
    expect(ensureDramaCampaign).toHaveBeenCalledExactlyOnceWith('201', '101'),
  )
  expect(writeText).toHaveBeenCalledWith('https://mini.example/link')
})

for (const mobile of [false, true]) {
  test.each([
    ['直连已上线且未同步', 'byteplus_web', 'published', undefined, true],
    ['直连下线但官方已上线', 'byteplus_web', 'offline', 7, false],
    ['直连尚未上线', 'byteplus_web', 'unpublished', undefined, false],
    ['官方应用只有直连线上内容', 'tiktok_minis', 'published', undefined, false],
    ['官方应用已有官方线上内容', 'tiktok_minis', 'offline', 7, true],
  ] as const)(`%s时按目标应用通道开放复制（${mobile ? '移动端' : '桌面端'}）`, async (_label, provider, directStatus, onlineVersion, enabled) => {
    const breakpoint = vi.spyOn(Grid, 'useBreakpoint').mockReturnValue({ xs: mobile, md: !mobile })
    try {
      const f = fixture({}, {
        onlineVersion,
        directPublication: { status: directStatus, version: 1, revision: 1, pendingChanges: false, enabledApplications: 1 },
      })
      f.setTask(null)
      const ensureDramaCampaign = vi.fn(async () => ({ landingUrl: 'https://www.tiktok.com/minis/test-link' }))
      const writeText = vi.fn(async () => {})
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
      render(<OfficialPublicationManagement {...f.props}
        api={{ ...f.api, ensureDramaCampaign } as unknown as OperationsApi}
        applications={[{ id: '102', name: '目标应用', playbackProvider: provider } as Application]}
        applicationId="102" canCopyCampaign />)
      const button = await screen.findByRole('button', { name: '复制投放链接' })
      if (enabled) {
        expect(button).toBeEnabled()
        fireEvent.click(button)
        await waitFor(() => expect(ensureDramaCampaign).toHaveBeenCalledExactlyOnceWith('201', '102'))
        expect(writeText).toHaveBeenCalledWith('https://www.tiktok.com/minis/test-link')
      } else {
        expect(button).toBeDisabled()
        fireEvent.click(button)
        expect(ensureDramaCampaign).not.toHaveBeenCalled()
      }
      expect(f.api.submitTikTokPublication).not.toHaveBeenCalled()
      expect(f.api.submitTikTokReview).not.toHaveBeenCalled()
    } finally {
      breakpoint.mockRestore()
    }
  })
}

test('首次同步直接校验已保存草稿，默认不转码', async () => {
  const f = fixture({}, { publishStatus: 'draft', onlineVersion: undefined })
  f.setTask(null)
  render(<OfficialPublicationManagement {...f.props} />)
  fireEvent.click(await screen.findByRole('button', { name: '同步 TikTok' }))
  expect(f.api.submitTikTokPublication).not.toHaveBeenCalled()
  await confirm('同步 TikTok')
  await waitFor(() =>
    expect(f.api.submitTikTokPublication).toHaveBeenCalledExactlyOnceWith(
      '201', {transcode:false},
    ),
  )
  expect(f.api.submitTikTokReview).not.toHaveBeenCalled()
})

test('同步时可显式选择转码，选择不会自动送审', async () => {
  const f = fixture({}, { onlineVersion: undefined })
  f.setTask(null)
  render(<OfficialPublicationManagement {...f.props} />)
  fireEvent.click(await screen.findByRole('button', { name: '同步 TikTok' }))
  fireEvent.click(await screen.findByRole('checkbox', { name: '生成多清晰度视频（转码）' }))
  await confirm('同步 TikTok')
  await waitFor(() => expect(f.api.submitTikTokPublication).toHaveBeenCalledExactlyOnceWith('201', {transcode:true}))
  expect(f.api.submitTikTokReview).not.toHaveBeenCalled()
})

test('送审弹窗携带选择的加急优先级，不自动上线', async () => {
  const f = fixture(
    { status: 'synced', stage: 'await_submit_review', reviewStatus: 0 },
    { onlineVersion: undefined },
  )
  render(<OfficialPublicationManagement {...f.props} />)
  fireEvent.click(await screen.findByRole('button', { name: '提交送审' }))
  fireEvent.mouseDown(
    await screen.findByRole('combobox', { name: '审核优先级' }),
  )
  fireEvent.click(await screen.findByText('加急审核'))
  await confirm('提交送审')
  await waitFor(() =>
    expect(f.api.submitTikTokReview).toHaveBeenCalledExactlyOnceWith('201', {
      priority: 'urgent',
    }),
  )
  expect(f.api.publishTikTokPublication).not.toHaveBeenCalled()
})

test('加急额度用尽默认普通审核并走安全的原任务重试', async () => {
  const f = fixture({
    status: 'failed',
    stage: 'submit_review',
    reviewStatus: 0,
    errorCode: 'urgent_review_quota_exceeded',
    priority: 'urgent',
  })
  render(<OfficialPublicationManagement {...f.props} />)
  fireEvent.click(await screen.findByRole('button', { name: '重新提交送审' }))
  const dialog = await screen.findByRole('dialog')
  expect(
    within(dialog).getByText(/组织今日加急审核额度已用完/),
  ).toBeInTheDocument()
  expect(within(dialog).getByText('普通审核')).toBeInTheDocument()
  await confirm('重新提交送审')
  await waitFor(() =>
    expect(f.api.retryTikTokPublication).toHaveBeenCalledExactlyOnceWith(
      '201',
      { priority: 'normal' },
    ),
  )
  expect(f.api.submitTikTokReview).not.toHaveBeenCalled()
})

test('查询审核只触发查询，通过后等待人工确认并绑定原任务上线', async () => {
  const f = fixture({
    status: 'under_review',
    stage: 'poll_review',
    reviewStatus: 1,
  })
  render(<OfficialPublicationManagement {...f.props} />)
  fireEvent.click(await screen.findByRole('button', { name: '查询审核结果' }))
  await waitFor(() =>
    expect(f.api.refreshTikTokReview).toHaveBeenCalledExactlyOnceWith('201'),
  )
  expect(f.api.publishTikTokPublication).not.toHaveBeenCalled()
  fireEvent.click(await screen.findByRole('button', { name: '更新上线' }))
  await confirm('更新上线')
  await waitFor(() =>
    expect(f.api.publishTikTokPublication).toHaveBeenCalledExactlyOnceWith(
      '201',
      '701',
    ),
  )
  expect(screen.getByText('已上线 · V7')).toBeInTheDocument()
})

test.each(['id', 'platformVersion'] as const)(
  '弹窗确认前 %s 变更会阻止上线，不能偷换任务',
  async (field) => {
    const f = fixture({ status: 'approved', stage: 'await_publish' })
    render(<OfficialPublicationManagement {...f.props} />)
    fireEvent.click(await screen.findByRole('button', { name: '更新上线' }))
    await screen.findByRole('dialog')
    f.setTask({ ...f.getTask(), [field]: field === 'id' ? '702' : 8 })
    await confirm('更新上线')
    await waitFor(() =>
      expect(f.props.notify).toHaveBeenCalledWith(
        '发布状态已变化，请查看刷新后的状态再确认',
        'error',
      ),
    )
    expect(f.api.publishTikTokPublication).not.toHaveBeenCalled()
  },
)

test('列表点击前状态变化先刷新，不打开旧任务确认', async () => {
  const f = fixture({ status: 'approved', stage: 'await_publish' })
  render(<OfficialPublicationManagement {...f.props} />)
  const button = await screen.findByRole('button', { name: '更新上线' })
  f.setTask({ ...f.getTask(), id: '702' })
  fireEvent.click(button)
  await waitFor(() =>
    expect(f.props.notify).toHaveBeenCalledWith(
      '发布状态已变化，请查看刷新后的状态再操作',
      'error',
    ),
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(f.api.publishTikTokPublication).not.toHaveBeenCalled()
})

test('下线被推荐门禁拒绝只友好提示，线上版本和重试入口保留', async () => {
  const f = fixture()
  f.api.unpublishDrama.mockRejectedValue(
    new ApiError(
      'recommendation references token=private',
      409,
      'publication_in_recommendations',
    ),
  )
  const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    render(<OfficialPublicationManagement {...f.props} />)
    fireEvent.click(await screen.findByRole('button', { name: /^下\s*线$/ }))
    await confirm('下线')
    await waitFor(() =>
      expect(f.props.notify).toHaveBeenCalledWith(
        '请先从当前渠道的轮播或热播中移除该短剧，再下线',
        'error',
      ),
    )
    expect(screen.getByText('已上线 · V7')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(log).toHaveBeenCalledWith('官方发布下线失败', {
      error: 'recommendation references token=[已脱敏]',
    })
    expect(f.api.listDramas).toHaveBeenCalledTimes(1)
  } finally {
    log.mockRestore()
  }
})

test('失败上线按上线权限恢复，不要求同步权限', async () => {
  const f = fixture(
    { status: 'failed', stage: 'list_album', currentContentChanged: true },
    { publishStatus: 'ready' },
  )
  render(
    <OfficialPublicationManagement
      {...f.props}
      canSync={false}
      canReview={false}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: '重试上线' }))
  await confirm('重试上线')
  await waitFor(() =>
    expect(f.api.retryTikTokPublication).toHaveBeenCalledExactlyOnceWith('201'),
  )
  expect(f.api.submitTikTokPublication).not.toHaveBeenCalled()
})

test('撤回须明确确认，已有线上内容不改变', async () => {
  const f = fixture({
    status: 'under_review',
    stage: 'poll_review',
    reviewStatus: 1,
  })
  render(<OfficialPublicationManagement {...f.props} />)
  fireEvent.click(await screen.findByRole('button', { name: '撤回送审' }))
  expect(f.api.withdrawTikTokReview).not.toHaveBeenCalled()
  await confirm('撤回送审')
  await waitFor(() =>
    expect(f.api.withdrawTikTokReview).toHaveBeenCalledExactlyOnceWith('201'),
  )
  expect(screen.getByText('已上线 · V7')).toBeInTheDocument()
})

test('申诉只选择尚未申诉的被拒项目，校验证据并按原对象提交', async () => {
  const f = fixture({
    status: 'rejected',
    stage: 'poll_review',
    reviewStatus: 3,
    platformAlbumId: '100',
    episodeIdsBySequence: { 1: '101', 2: '102', 3: '103' },
    reviewItems: { 100: 2, 101: 7, 102: 3, 103: 6 },
  })
  render(<OfficialPublicationManagement {...f.props} />)
  fireEvent.click(await screen.findByRole('button', { name: '提交申诉' }))
  fireEvent.mouseDown(await screen.findByRole('combobox', { name: '申诉对象' }))
  fireEvent.click(await screen.findByText('第 2 集'))
  expect(screen.queryByText('剧目信息')).not.toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: '申诉理由' }), {
    target: { value: ' 请复核第 2 集 ' },
  })
  fireEvent.change(screen.getByRole('textbox', { name: '证据附件' }), {
    target: { value: 'http://invalid.example' },
  })
  await confirm('提交申诉')
  expect(await screen.findByText('请检查附件地址和数量')).toBeInTheDocument()
  expect(f.api.appealTikTokReview).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('textbox', { name: '证据附件' }), {
    target: { value: 'https://assets.example/proof.png' },
  })
  await confirm('提交申诉')
  await waitFor(() =>
    expect(f.api.appealTikTokReview).toHaveBeenCalledExactlyOnceWith('201', {
      itemType: 2,
      itemId: '102',
      reason: '请复核第 2 集',
      attachmentUrls: ['https://assets.example/proof.png'],
    }),
  )
})

test('已被拒的申诉不重复写入，仍可修改内容', async () => {
  const f = fixture({
    status: 'rejected',
    stage: 'poll_appeal',
    reviewStatus: 3,
    platformAlbumId: '100',
    reviewItems: { 100: 7 },
  })
  const onEdit = vi.fn()
  render(<OfficialPublicationManagement {...f.props} onEdit={onEdit} />)
  fireEvent.click(await screen.findByRole('button', { name: '提交申诉' }))
  await waitFor(() =>
    expect(f.props.notify).toHaveBeenCalledWith(
      '当前没有可申诉项目，请查看审核意见并修改内容',
      'error',
    ),
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '修改内容' }))
  expect(onEdit).toHaveBeenCalledWith('201')
})

test('送审写入未知只有只读查询，不能重复送审或同步', async () => {
  const f = fixture(
    {
      status: 'failed',
      stage: 'submit_review',
      reviewStatus: 0,
      errorCode: 'external_write_uncertain',
      currentContentChanged: true,
    },
    { publishStatus: 'ready' },
  )
  render(<OfficialPublicationManagement {...f.props} />)
  fireEvent.click(
    await screen.findByRole('button', { name: '只读查询审核状态' }),
  )
  await waitFor(() =>
    expect(f.api.refreshTikTokReview).toHaveBeenCalledWith('201'),
  )
  expect(f.api.submitTikTokReview).not.toHaveBeenCalled()
  expect(f.api.retryTikTokPublication).not.toHaveBeenCalled()
  expect(f.api.submitTikTokPublication).not.toHaveBeenCalled()
})

test('已有版本的未知更新先确认恢复行为，连续点击只开启一个操作', async () => {
  const f = fixture({
    status: 'failed',
    stage: 'update_album',
    errorCode: 'external_write_uncertain',
    platformAlbumId: '100',
  })
  const read = deferred<TikTokPublication>()
  f.api.findTikTokPublication.mockReturnValueOnce(read.promise)
  render(<OfficialPublicationManagement {...f.props} />)
  const button = await screen.findByRole('button', { name: '恢复同步' })
  fireEvent.click(button)
  fireEvent.click(button)
  await act(async () => read.resolve(f.getTask()))
  expect(await screen.findByText(/先核对官方结果；若官方仍停在 V/)).toBeInTheDocument()
  await confirm('恢复同步')
  await waitFor(() =>
    expect(f.api.retryTikTokPublication).toHaveBeenCalledExactlyOnceWith('201'),
  )
  expect(f.api.submitTikTokPublication).not.toHaveBeenCalled()
})

test('首次同步未知仍提示只核对，未确认响应给出明确恢复提示', async () => {
  const f = fixture({
    status: 'failed', stage: 'update_album', errorCode: 'external_write_uncertain',
    platformAlbumId: '100', platformVersion: 0,
  })
  f.api.retryTikTokPublication.mockRejectedValue(new ApiError('TikTok http_500; token=private', 409, 'album_update_unconfirmed'))
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    render(<OfficialPublicationManagement {...f.props} />)
    fireEvent.click(await screen.findByRole('button', { name: '核对同步结果' }))
    expect(screen.queryByText('0', { exact: true })).not.toBeInTheDocument()
    expect(await screen.findByText(/只查询并核对首次同步结果/)).toBeInTheDocument()
    await confirm('核对同步结果')
    await waitFor(() => expect(f.props.notify).toHaveBeenCalledWith('官方版本尚未确认，冻结内容和进度已保留，请稍后再恢复同步', 'error'))
    expect(warning).toHaveBeenCalledWith('官方发布核对同步结果失败', { error: 'TikTok http_500; token=[已脱敏]' })
    expect(error).not.toHaveBeenCalled()
    expect(f.api.submitTikTokPublication).not.toHaveBeenCalled()
    expect(f.api.submitTikTokReview).not.toHaveBeenCalled()
  } finally {
    warning.mockRestore()
    error.mockRestore()
  }
})

test('离开列表后返回的任务读取不能继续写入或通知', async () => {
  const f = fixture({
    status: 'under_review',
    stage: 'poll_review',
    reviewStatus: 1,
  })
  const read = deferred<TikTokPublication>()
  f.api.findTikTokPublication.mockReturnValueOnce(read.promise)
  const view = render(<OfficialPublicationManagement {...f.props} />)
  fireEvent.click(await screen.findByRole('button', { name: '查询审核结果' }))
  view.unmount()
  await act(async () => read.resolve(f.getTask()))
  expect(f.api.refreshTikTokReview).not.toHaveBeenCalled()
  expect(f.props.notify).not.toHaveBeenCalled()
})

test('离开列表后命令结果不通知或再刷新其他页面', async () => {
  const f = fixture({ status: 'approved', stage: 'await_publish' })
  const write = deferred<TikTokPublication>()
  f.api.publishTikTokPublication.mockReturnValueOnce(write.promise)
  const view = render(<OfficialPublicationManagement {...f.props} />)
  fireEvent.click(await screen.findByRole('button', { name: '更新上线' }))
  await confirm('更新上线')
  await waitFor(() =>
    expect(f.api.publishTikTokPublication).toHaveBeenCalledOnce(),
  )
  view.unmount()
  await act(async () => write.resolve(f.getTask()))
  expect(f.props.notify).not.toHaveBeenCalled()
  expect(f.api.listDramas).toHaveBeenCalledTimes(1)
})

test('详情地址关闭后旧请求不能重新打开抽屉', async () => {
  const f = fixture()
  const read = deferred<TikTokPublication>()
  f.api.findTikTokPublication.mockReturnValueOnce(read.promise)
  const view = render(
    <OfficialPublicationManagement {...f.props} initialDramaId="201" />,
  )
  await screen.findByRole('dialog')
  view.rerender(<OfficialPublicationManagement {...f.props} />)
  await act(async () => read.resolve(f.getTask()))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('目录加载故障保留刷新入口，实际异常记录脱敏', async () => {
  const f = fixture()
  f.api.listDramas.mockRejectedValueOnce(new Error('offline token=abc'))
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    render(<OfficialPublicationManagement {...f.props} />)
    fireEvent.click(await screen.findByRole('button', { name: '重新加载' }))
    expect(await screen.findByText('已上线 · V7')).toBeInTheDocument()
    expect(log).toHaveBeenCalledWith('读取官方发布目录失败', {
      error: 'offline token=[已脱敏]',
    })
    expect(screen.queryByText('offline token=abc')).not.toBeInTheDocument()
  } finally {
    log.mockRestore()
  }
})

test('同步进度定时读取本地目录，到待送审时停止，不能自动送审或上线', async () => {
  const f = fixture({ status: 'processing', stage: 'register_videos' })
  vi.useFakeTimers()
  const visible = vi
    .spyOn(document, 'visibilityState', 'get')
    .mockReturnValue('visible')
  try {
    await act(async () => {
      render(<OfficialPublicationManagement {...f.props} />)
    })
    expect(screen.getByText('正在处理素材')).toBeInTheDocument()
    f.setTask({
      ...f.getTask(),
      status: 'synced',
      stage: 'await_submit_review',
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(f.api.listDramas).toHaveBeenCalledTimes(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(f.api.listDramas).toHaveBeenCalledTimes(2)
    expect(f.api.refreshTikTokReview).not.toHaveBeenCalled()
    expect(f.api.submitTikTokReview).not.toHaveBeenCalled()
    expect(f.api.publishTikTokPublication).not.toHaveBeenCalled()
  } finally {
    visible.mockRestore()
    vi.useRealTimers()
  }
})


test('V2 审核期间仍可下线 V1，审核任务变更不偷换目标', async () => {
 const f=fixture({ id:'702',status:'under_review',stage:'poll_review',platformVersion:8 }, { officialRelease:{ selectedPublicationId:'701',version:7,status:'online' } })
 render(<OfficialPublicationManagement {...f.props} />)
 fireEvent.click(await screen.findByRole('button',{name:/^下\s*线$/}))
 await screen.findByRole('dialog')
 f.setTask({...f.getTask(),id:'703',status:'approved',stage:'await_publish',platformVersion:9})
 await confirm('下线')
 await waitFor(()=>expect(f.api.changeTikTokRelease).toHaveBeenCalledWith('201',{action:'delist',selectedPublicationId:'701'}))
 expect(f.api.unpublishDrama).not.toHaveBeenCalled()
 expect(f.api.submitTikTokPublication).not.toHaveBeenCalled()
})

test('草稿变更且 V2 审核中，重新上线仍绑定已审核 V1', async () => {
 const f=fixture({id:'702',status:'under_review',stage:'poll_review',platformVersion:8},{onlineVersion:undefined,officialRelease:{selectedPublicationId:'701',version:7,status:'offline'}})
 render(<OfficialPublicationManagement {...f.props} />)
 expect(await screen.findByText('已下线 · V7')).toBeInTheDocument()
 fireEvent.click(await screen.findByRole('button',{name:'重新上线 V7'}))
 expect(await screen.findByText(/沿用该版本内容/)).toBeInTheDocument()
 await confirm('重新上线 V7')
 await waitFor(()=>expect(f.api.changeTikTokRelease).toHaveBeenCalledWith('201',{action:'list',selectedPublicationId:'701'}))
 expect(f.api.publishTikTokPublication).not.toHaveBeenCalled()
 expect(f.api.submitTikTokReview).not.toHaveBeenCalled()
})

test('确认弹窗中已选版本变化时，拒绝上下架新版本', async () => {
 const f=fixture({}, {officialRelease:{selectedPublicationId:'701',version:7,status:'online'}})
 render(<OfficialPublicationManagement {...f.props} />)
 fireEvent.click(await screen.findByRole('button',{name:/^下\s*线$/}))
 await screen.findByRole('dialog')
 f.row.officialRelease={selectedPublicationId:'702',version:8,status:'online'}
 await confirm('下线')
 await waitFor(()=>expect(f.props.notify).toHaveBeenCalledWith('发布状态已变化，请查看刷新后的状态再确认','error'))
 expect(f.api.changeTikTokRelease).not.toHaveBeenCalled()
})

test('独立下线被轮播热播拒绝时仅显示友好提示，保留 V1 和 V2 任务', async () => {
 const f=fixture({id:'702',status:'under_review',stage:'poll_review'}, {officialRelease:{selectedPublicationId:'701',version:7,status:'online'}})
 f.api.changeTikTokRelease.mockRejectedValue(new ApiError('blocked',409,'publication_in_recommendations'))
 const log=vi.spyOn(console,'warn').mockImplementation(()=>{})
 try {
  render(<OfficialPublicationManagement {...f.props} />)
  fireEvent.click(await screen.findByRole('button',{name:/^下\s*线$/}))
  await confirm('下线')
  await waitFor(()=>expect(f.props.notify).toHaveBeenCalledWith('请先从当前渠道的轮播或热播中移除该短剧，再下线','error'))
  expect(screen.getByText('已上线 · V7')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(f.getTask().status).toBe('under_review')
 }finally{log.mockRestore()}
})
