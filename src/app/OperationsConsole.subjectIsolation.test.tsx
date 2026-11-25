import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { OperationsApi } from '../api'
import type { AdminSession, Drama, DramaListPage } from '../domain'

const { auth } = vi.hoisted(() => ({
  auth: {
    authenticated: true,
    session: {
      user: { id: '1', username: 'subject-fixture', isSuper: true, nickname: '', status: 'active', roleIds: [], createdAt: '', updatedAt: '' },
      permissions: ['content.drama.read'],
      menus: [{ id: 'dramas', name: '短剧管理', route: '/dramas', children: [] }],
    } satisfies AdminSession,
    setAuthenticated: vi.fn(), login: vi.fn(), endSession: vi.fn(), refreshSession: vi.fn(),
  },
}))
vi.mock('../features/auth/useAdminSession', () => ({ useAdminSession: () => auth }))

import { OperationsConsole } from './OperationsConsole'

const base: Drama = { id: '201', title: '共享草稿', description: '测试简介', coverUrl: 'https://fixture.test/cover.png', tags: [], tagIds: ['21'], status: 'updating', year: 2026, language: 'zh', dramaType: 4, publishStatus: 'draft', episodes: [] }

beforeEach(() => {
  const entries = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value), removeItem: (key: string) => entries.delete(key), get length() { return entries.size }, key: (index: number) => [...entries.keys()][index] ?? null })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

// fixture 使用真实控制台、目录 Hook 和编辑器，只延迟外部请求，验证旧写入不能影响新主体的状态与路由。
function fixture(mode: 'edit' | 'create', deletable = false) {
  window.history.replaceState({ dramaRouteIndex: 0 }, '', mode === 'edit' ? '/dramas/201/edit' : '/dramas/new')
  let subject = '1', application = '11'
  let finishSave!: (drama: Drama) => void, finishReadB!: (drama: Drama) => void
  let finishDelete!: () => void, finishRefresh!: (page: DramaListPage) => void
  let delayRefresh = false
  const remove = vi.fn(() => new Promise<void>(resolve => { finishDelete = resolve }))
  const pageForSubject = () => ({ items: [{ ...base, ...(subject === '1' ? {} : { id: '202', title: '主体 B 独立草稿' }), episodeCount: 0, readyEpisodeCount: 0 }], total: 1 })
  let delayedPage: DramaListPage
  const list = vi.fn(() => {
    const currentPage = deletable ? pageForSubject() : { items: [], total: 0 }
    if (delayRefresh) { delayRefresh = false; delayedPage = currentPage; return new Promise<DramaListPage>(resolve => { finishRefresh = resolve }) }
    return Promise.resolve(currentPage)
  })
  const save = vi.fn(() => new Promise<Drama>(resolve => { finishSave = resolve }))
  const read = vi.fn((id: string) => {
    if (subject === '1' && id === '201') return Promise.resolve({ ...base, onlineVersion: deletable ? 0 : 3 })
    if (subject === '2' && id === '202') return new Promise<Drama>(resolve => { finishReadB = resolve })
    throw new Error('跨主体剧目请求')
  })
  const api = {
    getSubjectId: () => subject, setSubjectId: (id: string) => { subject = id }, getApplicationId: () => application, setApplicationId: (id: string) => { application = id },
    listSubjectOptions: async () => [{ id: '1', name: '主体 A' }, { id: '2', name: '主体 B' }],
    listApplications: async () => [{ id: '11', subjectId: '1', name: '应用 A', tiktokAppId: '00011', status: 'active' }, { id: '12', subjectId: '1', name: '同主体应用', tiktokAppId: '00012', status: 'active' }, { id: '21', subjectId: '2', name: '应用 B', tiktokAppId: '00021', status: 'active' }],
    overview: async () => ({}), listDramas: list, findDrama: read, updateDrama: save, createDrama: save, deleteDrama: remove,
    uploadCover: async () => ({ url: base.coverUrl, uploadId: 'fixture-cover' }),
    dramaReferenceData: async () => ({ schemaVersion: '1', sourceUrl: '', statuses: [{ value: 'updating', label: '更新中' }], languages: [], dramaTypes: [{ value: 4, label: '真人本地化' }], tags: [{ id: '21', officialName: '悬疑推理' }] }),
    listDramaMediaJobs: async () => [],
  } as unknown as OperationsApi
  render(<OperationsConsole api={api} />)
  return { save, read, list, remove, finishDelete: () => finishDelete(), delayNextRefresh: () => { delayRefresh = true }, hasRefresh: () => typeof finishRefresh === 'function', finishRefresh: () => finishRefresh(delayedPage), finishSave: (drama: Drama) => finishSave(drama), finishReadB: (drama: Drama) => finishReadB(drama), hasReadB: () => typeof finishReadB === 'function' }
}

async function switchSubject() {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '当前主体' }))
  fireEvent.click(await screen.findByText('主体 B', { selector: '.ant-select-item-option-content' }))
}

test.each([{ label: '桌面', width: 1440 }, { label: '手机', width: 390 }])('$label切换主体退出旧编辑页，旧保存不能影响新主体独立草稿', async ({ width }) => {
  vi.stubGlobal('innerWidth', width)
  const ctx = fixture('edit', true)
  fireEvent.change(await screen.findByLabelText('短剧名称'), { target: { value: '主体 A 迟到保存' } })
  fireEvent.click(screen.getByLabelText('保存草稿'))
  await waitFor(() => expect(ctx.save).toHaveBeenCalledOnce())
  await switchSubject()
  await screen.findByRole('heading', { name: '短剧管理' })
  expect(ctx.read).not.toHaveBeenCalledWith('202')
  fireEvent.click(await screen.findByRole('button', { name: '编辑 主体 B 独立草稿' }))
  await waitFor(() => expect(ctx.hasReadB()).toBe(true))
  await act(async () => ctx.finishSave({ ...base, title: '主体 A 迟到保存', onlineVersion: 3 }))
  expect(screen.queryByDisplayValue('主体 A 迟到保存')).not.toBeInTheDocument()
  await act(async () => ctx.finishReadB({ ...base, id: '202', title: '主体 B 当前草稿', onlineVersion: 0 }))
  expect(await screen.findByLabelText('短剧名称')).toHaveValue('主体 B 当前草稿')
  expect(window.location.pathname).toBe('/dramas/202/edit')
})

test.each([{ label: '桌面', width: 1440 }, { label: '手机', width: 390 }])('$label新建保存期间切换主体，不跳转到旧主体保存的详情', async ({ width }) => {
  vi.stubGlobal('innerWidth', width)
  const ctx = fixture('create')
  fireEvent.change(await screen.findByLabelText('短剧名称'), { target: { value: '主体 A 新建' } })
  fireEvent.change(screen.getByLabelText('短剧简介'), { target: { value: '测试简介' } })
  // 封面上传属于当前主体；返回后继续发出真实编辑器的新建请求。
  const file = new File(['fixture'], 'cover.png', { type: 'image/png' })
  const upload = screen.getByLabelText('上传短剧封面')
  const input = upload instanceof HTMLInputElement ? upload : upload.querySelector('input[type="file"]') ?? upload.closest('.ant-upload')?.querySelector('input[type="file"]')
  if (!input) throw new Error('找不到封面上传入口')
  fireEvent.change(input, { target: { files: [file] } })
  fireEvent.click(screen.getByLabelText('保存草稿'))
  await waitFor(() => expect(ctx.save).toHaveBeenCalledOnce())
  await switchSubject()
  await screen.findByLabelText('短剧名称')
  await act(async () => ctx.finishSave({ ...base, title: '主体 A 新建', onlineVersion: 3 }))
  expect(window.location.pathname).toBe('/dramas/new')
  expect(screen.getByLabelText('短剧名称')).toHaveValue('')
})

test('同主体应用切换不丢弃正常保存结果', async () => {
  const ctx = fixture('edit')
  fireEvent.change(await screen.findByLabelText('短剧名称'), { target: { value: '同主体正常保存' } })
  fireEvent.click(screen.getByLabelText('保存草稿'))
  await waitFor(() => expect(ctx.save).toHaveBeenCalledOnce())
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '当前应用' }))
  fireEvent.click(await screen.findByText('同主体应用', { exact: true }))
  await act(async () => ctx.finishSave({ ...base, title: '同主体正常保存' }))
  expect(screen.getByLabelText('短剧名称')).toHaveValue('同主体正常保存')
  expect(screen.getByText('草稿已保存，视频可稍后上传')).toBeInTheDocument()
})

// beginDelete 模拟真实确认、请求挂起后取消弹窗；取消不会撤销已发出的服务端删除。
async function beginDelete(ctx: ReturnType<typeof fixture>) {
  await screen.findByLabelText('短剧名称')
  fireEvent.click(screen.getByLabelText('删除短剧'))
  fireEvent.click(await screen.findByText(/^删\s*除$/, { selector: 'button span' }))
  await waitFor(() => expect(ctx.remove).toHaveBeenCalledExactlyOnceWith('201'))
  fireEvent.click(screen.getByText(/^取\s*消$/, { selector: 'button span' }))
}

// editOtherDrama 切换主体并通过真实列表打开另一部草稿，保留尚未保存的输入。
async function editOtherDrama(ctx: ReturnType<typeof fixture>) {
  await switchSubject()
  fireEvent.click(await screen.findByRole('button', { name: '编辑 主体 B 独立草稿' }))
  await waitFor(() => expect(ctx.hasReadB()).toBe(true))
  await act(async () => ctx.finishReadB({ ...base, id: '202', title: '主体 B 独立草稿', onlineVersion: 0 }))
  fireEvent.change(await screen.findByLabelText('短剧名称'), { target: { value: '主体 B 未保存内容' } })
  expect(window.location.pathname).toBe('/dramas/202/edit')
}

test.each([{ label: '桌面', width: 1440 }, { label: '手机', width: 390 }])('$label旧删除完成不能关闭新主体编辑器或跳转列表', async ({ width }) => {
  vi.stubGlobal('innerWidth', width)
  const ctx = fixture('edit', true)
  await beginDelete(ctx)
  // 浏览器返回不依赖桌面侧栏，手机也可以在关闭确认框后离开旧编辑页。
  await act(async () => {
    window.history.replaceState({ dramaRouteIndex: 0 }, '', '/dramas')
    window.dispatchEvent(new PopStateEvent('popstate', { state: { dramaRouteIndex: 0 } }))
  })
  await screen.findByRole('heading', { name: '短剧管理' })
  await editOtherDrama(ctx)
  const listCalls = ctx.list.mock.calls.length
  await act(async () => ctx.finishDelete())
  expect(window.location.pathname).toBe('/dramas/202/edit')
  expect(screen.getByLabelText('短剧名称')).toHaveValue('主体 B 未保存内容')
  expect(ctx.list).toHaveBeenCalledTimes(listCalls)
  expect(screen.queryByText('剧目已删除')).not.toBeInTheDocument()
}, 40_000)

test('旧删除已成功但刷新仍挂起时切换主体，刷新完成也不能跳转新编辑页', async () => {
  const ctx = fixture('edit', true)
  await beginDelete(ctx)
  fireEvent.click(screen.getByRole('menuitem', { name: '短剧管理' }))
  await screen.findByRole('heading', { name: '短剧管理' })
  ctx.delayNextRefresh()
  await act(async () => ctx.finishDelete())
  await waitFor(() => expect(ctx.hasRefresh()).toBe(true))
  await editOtherDrama(ctx)
  await act(async () => ctx.finishRefresh())
  expect(window.location.pathname).toBe('/dramas/202/edit')
  expect(screen.getByLabelText('短剧名称')).toHaveValue('主体 B 未保存内容')
}, 40_000)

test('同主体应用切换后，当前删除仍刷新列表并正常导航', async () => {
  const ctx = fixture('edit', true)
  await beginDelete(ctx)
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '当前应用' }))
  fireEvent.click(await screen.findByText('同主体应用', { exact: true }))
  const listCalls = ctx.list.mock.calls.length
  await act(async () => ctx.finishDelete())
  await screen.findByRole('heading', { name: '短剧管理' })
  expect(window.location.pathname).toBe('/dramas')
  expect(ctx.list.mock.calls.length).toBeGreaterThan(listCalls)
  expect(screen.getByText('剧目已删除')).toBeInTheDocument()
})

test.each([
  { kind: 'drama', route: '/channels/drama-report', width: 1440 },
  { kind: 'drama', route: '/channels/drama-report', width: 390 },
  { kind: 'campaign', route: '/channels/campaign-report', width: 1440 },
  { kind: 'campaign', route: '/channels/campaign-report', width: 390 },
])('$kind 报表在 $width 视口切换主体，清除应用筛选并忽略旧响应', async ({ kind, route, width }) => {
  vi.stubGlobal('innerWidth', width)
  window.history.replaceState({ dramaRouteIndex: 0 }, '', route)
  const previousMenus = auth.session.menus
  auth.session.menus = [...previousMenus, { id: kind, name: '主体报表', route, children: [] }]
  try {
    let subject = '1', application = '11', delayed = false
    let finishOld!: (data: unknown) => void
    const dramaData = (id: string, title: string) => ({ total: 1, items: [{ dramaId: id, title, unlockCount: 2, unlockUsers: 1, averageUnlocks: 2, playUsers: null, firstEpisodeCompletionRate: null }] })
    const campaignData = (id: string, name: string) => ({ total: 1, items: [{ campaignId: id, name, applicationId: id === '701' ? '11' : '21', applicationName: name, code: `code-${id}`, status: 'active', landingUrl: '', dramaTitle: name, rewardCompletions: 2, rewardUsers: 1, averageRewards: 2, episodeRewards: 2, vipRewards: 0 }] })
    const data = (old: boolean) => kind === 'drama' ? dramaData(old ? '201' : '202', old ? '旧主体报表内容' : '新主体报表内容') : campaignData(old ? '701' : '702', old ? '旧主体报表内容' : '新主体报表内容')
    const scopes: { subject: string; applicationId: string }[] = []
    const report = vi.fn((query: { applicationId: string }) => {
      scopes.push({ subject, applicationId: query.applicationId })
      if (subject === '1' && delayed) return new Promise<unknown>(resolve => { finishOld = resolve })
      return Promise.resolve(data(subject === '1'))
    })
    const api = {
      getSubjectId: () => subject, setSubjectId: (id: string) => { subject = id }, getApplicationId: () => application, setApplicationId: (id: string) => { application = id },
      listSubjectOptions: async () => [{ id: '1', name: '主体 A' }, { id: '2', name: '主体 B' }],
      listApplications: async () => [{ id: '11', subjectId: '1', name: '报表应用 A', tiktokAppId: '00011', status: 'active' }, { id: '21', subjectId: '2', name: '报表应用 B', tiktokAppId: '00021', status: 'active' }],
      overview: async () => ({}),
      listDramas: async () => ({ items: [], total: 0 }),
      dramaReport: report, campaignReport: report,
    } as unknown as OperationsApi
    render(<OperationsConsole api={api} />)
    await screen.findAllByText('旧主体报表内容')
    delayed = true
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '报表小程序' }))
    fireEvent.click(await screen.findByText('报表应用 A', { selector: '.ant-select-item-option-content' }))
    await waitFor(() => expect(typeof finishOld).toBe('function'))
    await switchSubject()
    await screen.findAllByText('新主体报表内容')
    expect(scopes.at(-1)).toEqual({ subject: '2', applicationId: '' })
    expect(screen.getByRole('combobox', { name: '报表小程序' }).closest('.ant-select')).toHaveTextContent('当前主体全部小程序')
    await act(async () => finishOld(data(true)))
    expect(screen.queryByText('旧主体报表内容')).not.toBeInTheDocument()
    expect(screen.getAllByText('新主体报表内容').length).toBeGreaterThan(0)
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '报表小程序' }))
    expect(await screen.findByText('报表应用 B', { selector: '.ant-select-item-option-content' })).toBeInTheDocument()
    expect(screen.queryByText('报表应用 A', { selector: '.ant-select-item-option-content' })).not.toBeInTheDocument()
    expect(window.location.pathname).toBe(route)
  } finally { auth.session.menus = previousMenus }
}, 40_000)


test('TikTok 标签切换主体重查关联数量，A→B→A 后旧响应不能覆盖新数量', async () => {
 const menus=auth.session.menus
 auth.session.menus=[...menus,{id:'tags',name:'TikTok 标签',route:'/content/tiktok-tags',children:[]}]
 try {
  window.history.replaceState({dramaRouteIndex:0},'', '/content/tiktok-tags')
  let subject='1',application='11',callsA=0
  let finishOld!:(rows:unknown[])=>void
  const tags=(dramaCount:number)=>[{id:'21',officialName:'悬疑推理',englishName:'Mystery',dramaCount}]
  const listTikTokTags=vi.fn(()=>{
   if(subject==='1'&&callsA++===0)return new Promise<unknown[]>(resolve=>{finishOld=resolve})
   return Promise.resolve(tags(subject==='1'?7:2))
  })
  const api={getSubjectId:()=>subject,setSubjectId:(id:string)=>{subject=id},getApplicationId:()=>application,setApplicationId:(id:string)=>{application=id},
   listSubjectOptions:async()=>[{id:'1',name:'主体 A'},{id:'2',name:'主体 B'}],
   listApplications:async()=>[{id:'11',subjectId:'1',name:'应用 A',tiktokAppId:'0011',status:'active'},{id:'21',subjectId:'2',name:'应用 B',tiktokAppId:'0021',status:'active'}],
   overview:async()=>({}),listDramas:async()=>({items:[],total:0}),listTikTokTags,
  } as unknown as OperationsApi
  render(<OperationsConsole api={api}/>)
  await waitFor(()=>expect(listTikTokTags).toHaveBeenCalledTimes(1))
  await switchSubject()
  expect(await screen.findByText('2 部短剧')).toBeInTheDocument()
  fireEvent.mouseDown(screen.getByRole('combobox',{name:'当前主体'}))
  fireEvent.click(await screen.findByText('主体 A',{selector:'.ant-select-item-option-content'}))
  expect(await screen.findByText('7 部短剧')).toBeInTheDocument()
  await act(async()=>finishOld(tags(99)))
  expect(screen.queryByText('99 部短剧')).not.toBeInTheDocument()
  expect(screen.getByText('7 部短剧')).toBeInTheDocument()
  expect(listTikTokTags).toHaveBeenCalledTimes(3)
 }finally{auth.session.menus=menus}
})
