import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { OperationsApi } from '../api'
import type { AdminSession } from '../domain'
import type { Application } from '../applications'

const { session, catalog } = vi.hoisted(() => ({
  session: {
    user: { id: '1', username: 'admin', nickname: '管理员', status: 'active', isSuper: false, roleIds: [], createdAt: '', updatedAt: '' },
    permissions: ['content.drama.read', 'operations.postback_log.read'],
    menus: [
      { id: 'dramas', name: '短剧管理', route: 'dramas', children: [] },
      { id: 'channels', name: '渠道管理', route: '', children: [{ id: 'postbacks', name: '回传日志', route: '/channels/postback-logs', children: [] }] },
    ],
  } satisfies AdminSession,
  catalog: {
    dramas: [] as import('../domain').DramaListItem[], catalogQuery: { page: 1, pageSize: 20 }, setCatalogQuery: vi.fn(), catalogTotal: 0, loading: false,
    dramaEditor: null, setDramaEditor: vi.fn(),
    load: vi.fn(async () => true), openDrama: vi.fn(async () => true), updateDrama: vi.fn(), deleteDrama: vi.fn(), resetCatalog: vi.fn(),
  },
}))

vi.mock('../features/auth/useAdminSession', () => ({
  useAdminSession: () => ({ authenticated: true, session, setAuthenticated: vi.fn(), loginBusy: false, loginError: '', login: vi.fn(), endSession: vi.fn(), refreshSession: vi.fn() }),
}))

vi.mock('../features/dramas/useDramaCatalog', () => ({ useDramaCatalog: () => catalog }))

import { OperationsConsole as ActualOperationsConsole } from './OperationsConsole'

function OperationsConsole(props: import('react').ComponentProps<typeof ActualOperationsConsole>) {
 const api=Object.assign({getSubjectId:()=>'',setSubjectId:()=>{},setApplicationId:()=>{},listSubjectOptions:async()=>[{id:'1',name:'现有主体'}],listApplicationOptions:async()=>props.api.listApplications?props.api.listApplications():props.api.getApplicationId()?[{id:props.api.getApplicationId(),subjectId:'1',name:'测试应用',tiktokAppId:'101',status:'active'}]:[]},props.api) as OperationsApi
 return <ActualOperationsConsole {...props} api={api}/>
}

beforeEach(() => {
  window.history.replaceState({ dramaRouteIndex: 0 }, '', '/dramas')
  vi.clearAllMocks()
  catalog.dramas = []
  catalog.catalogTotal = 0
})

test('主体切换自动选择所属应用，空主体清除旧应用；不依赖应用配置读取权限', async () => {
  window.history.replaceState({ dramaRouteIndex: 0 }, '', '/')
  const setSubjectId = vi.fn(), setApplicationId = vi.fn()
  const api = {
    getSubjectId: () => '1', setSubjectId, getApplicationId: () => '11', setApplicationId,
    listSubjectOptions: async () => [{ id: '1', name: '主体 A' }, { id: '2', name: '主体 B' }, { id: '3', name: '空主体' }],
    listApplicationOptions: async () => [{ id: '11', subjectId: '1', name: '应用 A', status: 'active' }, { id: '21', subjectId: '2', name: '应用 B', status: 'active' }],
    listApplications: vi.fn(),
  } as unknown as OperationsApi
  render(<OperationsConsole api={api} />)
  await waitFor(() => expect(setApplicationId).toHaveBeenLastCalledWith('11'))
  catalog.resetCatalog.mockClear()
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '当前主体' }))
  fireEvent.click(await screen.findByText('主体 B', { selector: '.ant-select-item-option-content' }))
  expect(catalog.resetCatalog).toHaveBeenCalledOnce()
  expect(setSubjectId).toHaveBeenLastCalledWith('2')
  expect(setApplicationId).toHaveBeenLastCalledWith('21')
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '当前主体' }))
  fireEvent.click(await screen.findByText('空主体', { selector: '.ant-select-item-option-content' }))
  expect(setSubjectId).toHaveBeenLastCalledWith('3')
  expect(setApplicationId).toHaveBeenLastCalledWith('')
  expect(screen.getByRole('combobox', { name: '当前应用' })).toBeDisabled()
  expect(api.listApplications).not.toHaveBeenCalled()
})

test('退出后忽略尚未返回的主体应用选项，不能恢复旧选择', async () => {
  window.history.replaceState({ dramaRouteIndex: 0 }, '', '/')
  let finish!: (value: { id: string; name: string }[]) => void
  const pending = new Promise<{ id: string; name: string }[]>(resolve => { finish = resolve })
  const setSubjectId = vi.fn(), setApplicationId = vi.fn()
  render(<OperationsConsole api={{ getSubjectId: () => '', getApplicationId: () => '', setSubjectId, setApplicationId, listSubjectOptions: () => pending, listApplicationOptions: async () => [] } as unknown as OperationsApi} />)
  fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
  setSubjectId.mockClear(); setApplicationId.mockClear()
  finish([{ id: '1', name: '过期主体' }])
  await waitFor(() => expect(screen.getByRole('heading', { name: '工作台' })).toBeInTheDocument())
  expect(setSubjectId).not.toHaveBeenCalled()
  expect(setApplicationId).not.toHaveBeenCalled()
})

test('仪表盘排首位时仍默认进入工作台，主动打开后才查询统计，标识可返回工作台', async () => {
  const originalPermissions = [...session.permissions], originalMenus = [...session.menus]
  session.permissions.push('operations.dashboard.read')
  session.menus.unshift({ id: 'dashboard', name: '应用概览', route: '/channels/dashboard', children: [] })
  window.history.replaceState({ dramaRouteIndex: 0 }, '', '/')
  const dashboard = vi.fn(async () => ({ days: [], campaignRanking: [], generatedAt: '2026-10-26T00:00:00Z' }))
  const api = { getApplicationId: () => '101', dashboard } as unknown as OperationsApi
  try {
    render(<OperationsConsole api={api} />)
    expect(await screen.findByRole('heading', { name: '工作台' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
    expect(dashboard).not.toHaveBeenCalled()
    expect(catalog.load).not.toHaveBeenCalled()

    const entries = within(screen.getByRole('navigation', { name: '工作入口' }))
    fireEvent.click(entries.getByRole('button', { name: '应用概览' }))
    await waitFor(() => expect(window.location.pathname).toBe('/channels/dashboard'))
    expect(await screen.findByRole('heading', { name: '仪表盘' })).toBeInTheDocument()
    await waitFor(() => expect(dashboard).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('link', { name: '返回工作台' }))
    expect(await screen.findByRole('heading', { name: '工作台' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  } finally {
    session.permissions.splice(0, session.permissions.length, ...originalPermissions)
    session.menus.splice(0, session.menus.length, ...originalMenus)
  }
})

test.each(['/unknown', '/system/users'])('未知或未授权地址 %s 返回工作台，入口同时检查菜单和业务权限', async (path) => {
  const originalMenus = [...session.menus]
  session.menus.push({ id: 'users', name: '管理员管理', route: '/system/users', children: [] })
  window.history.replaceState({ dramaRouteIndex: 0 }, '', path)
  try {
    render(<OperationsConsole api={{ getApplicationId: () => '' } as unknown as OperationsApi} />)
    expect(await screen.findByRole('heading', { name: '工作台' })).toBeInTheDocument()
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    const entries = within(screen.getByRole('navigation', { name: '工作入口' }))
    expect(entries.getByRole('button', { name: '短剧管理' })).toBeInTheDocument()
    expect(entries.queryByRole('button', { name: '管理员管理' })).not.toBeInTheDocument()
    expect(catalog.load).not.toHaveBeenCalled()
  } finally {
    session.menus.splice(0, session.menus.length, ...originalMenus)
  }
})

test('没有已授权菜单的账号仍能打开工作台并看到权限说明', async () => {
  const originalMenus = [...session.menus]
  session.menus.splice(0)
  window.history.replaceState({ dramaRouteIndex: 0 }, '', '/')
  try {
    render(<OperationsConsole api={{ getApplicationId: () => '' } as unknown as OperationsApi} />)
    expect(await screen.findByRole('heading', { name: '工作台' })).toBeInTheDocument()
    expect(screen.getByText('暂无可用功能，请联系管理员分配权限。')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '工作入口' })).not.toBeInTheDocument()
    expect(catalog.load).not.toHaveBeenCalled()
  } finally {
    session.menus.splice(0, session.menus.length, ...originalMenus)
  }
})

test('退出业务页面后重置默认入口', async () => {
  render(<OperationsConsole api={{ getApplicationId: () => '' } as unknown as OperationsApi} />)
  fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
  await waitFor(() => expect(window.location.pathname).toBe('/'))
})

test('菜单目录默认折叠，手动展开后点击页面同步更新 URL', async () => {
  const api = { getApplicationId: () => '' } as unknown as OperationsApi
  render(<OperationsConsole api={api} />)

  const directory = screen.getByRole('menuitem', { name: '渠道管理' })
  expect(directory).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('menuitem', { name: '回传日志' })).not.toBeInTheDocument()
  fireEvent.click(directory)
  expect(directory).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(await screen.findByText('回传日志'))

  await waitFor(() => expect(window.location.pathname).toBe('/channels/postback-logs'))
  expect(await screen.findByText('请先选择应用')).toBeInTheDocument()
})

test('普通应用编辑账号可选择播放器，不再要求历史播放配置权限', async () => {
  const originalPermissions = [...session.permissions], originalMenus = [...session.menus]
  session.permissions.splice(0, session.permissions.length, 'applications.read', 'applications.update')
  session.menus.splice(0, session.menus.length, { id: 'applications', name: 'TikTok 应用', route: '/channels/applications', children: [] })
  window.history.replaceState({ dramaRouteIndex: 0 }, '', '/channels/applications')
  const app: Application = { subjectId:'1', id: '102', name: 'Plotimo', tiktokAppId: '7685293427067586568', clientKey: 'fixture-key', status: 'active', playbackProvider: 'byteplus_web', playbackRevision: 4, monetizationMode: 'IAP', adUnits: { rewardedVideo: [], interstitial: [] }, logoUrl: '', secretRef: '', regionCode: 'GLOBAL', timeZone: 'UTC', complianceBaseUrl: '', createdAt: '', updatedAt: '' }
  const updateApplication = vi.fn(async (_id, input) => ({ ...app, ...input }))
  const api = { getApplicationId: () => '', setApplicationId: vi.fn(), listApplications: vi.fn(async () => [app]), updateApplication } as unknown as OperationsApi
  try {
    render(<OperationsConsole api={api} />)
    fireEvent.click(await screen.findByRole('button', { name: '编辑 Plotimo' }))
    const drawer = within(screen.getByRole('dialog'))
    expect(drawer.getByRole('combobox', { name: '播放器' })).toBeEnabled()
    expect(drawer.queryByText('修改播放器需要播放配置权限。')).not.toBeInTheDocument()
    fireEvent.mouseDown(drawer.getByRole('combobox', { name: '播放器' }))
    fireEvent.click(await screen.findByText('TikTok 官方播放器', { selector: '.ant-select-item-option-content' }))
    fireEvent.click(drawer.getByRole('button', { name: /保\s*存/ }))
    await waitFor(() => expect(updateApplication).toHaveBeenCalledWith('102', expect.objectContaining({ playbackProvider: 'tiktok_minis', playbackRevision: 4 })))
  } finally {
    session.permissions.splice(0, session.permissions.length, ...originalPermissions)
    session.menus.splice(0, session.menus.length, ...originalMenus)
  }
})

test('刷新短剧编辑地址时按字符串 ID 恢复详情', async () => {
  window.history.replaceState({ dramaRouteIndex: 0 }, '', '/dramas/drama%20001/edit')
  const api = { getApplicationId: () => '' } as unknown as OperationsApi

  render(<OperationsConsole api={api} />)

  await waitFor(() => expect(catalog.openDrama).toHaveBeenCalledWith({ id: 'drama 001' }))
  expect(window.location.pathname).toBe('/dramas/drama%20001/edit')
})

test('旧发布工作台地址恢复为官方列表详情，关闭详情保留列表', async () => {
  const originalPermissions = [...session.permissions], originalMenus = [...session.menus]
  session.menus.push({ id: 'official', name: '官方发布', route: '/official/publications', children: [] })
  window.history.replaceState({ dramaRouteIndex: 0 }, '', '/dramas/drama-a/publication')
  const api = {
    getApplicationId: () => '', listDramas: vi.fn(async () => ({ items: [], total: 0 })),
    findDrama: vi.fn(async () => ({ id: 'drama-a', title: '深链短剧', episodes: [] })),
    findTikTokPublication: vi.fn(async () => null),
  } as unknown as OperationsApi
  try {
    render(<OperationsConsole api={api} />)
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe('/official/publications?dramaId=drama-a'))
    const drawer = await screen.findByRole('dialog')
    expect(await within(drawer).findByText('尚未同步到 TikTok')).toBeInTheDocument()
    fireEvent.click(within(drawer).getByRole('button', { name: /close/i }))
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe('/official/publications'))
    expect(screen.getByRole('heading', { name: 'TikTok 官方发布' })).toBeInTheDocument()
  } finally {
    session.permissions.splice(0, session.permissions.length, ...originalPermissions)
    session.menus.splice(0, session.menus.length, ...originalMenus)
  }
})

test('移除审核菜单后仍能从官方详情查看该剧历史并返回原详情', async () => {
  const originalMenus = [...session.menus]
  session.menus.push({ id: 'official', name: '官方发布', route: '/official/publications', children: [] })
  window.history.replaceState({ dramaRouteIndex: 0 }, '', '/official/publications?dramaId=201')
  const listPublicationRecords = vi.fn(async () => ({ items: [], total: 0 }))
  const api = {
    getApplicationId: () => '', listDramas: vi.fn(async () => ({ items: [], total: 0 })),
    findDrama: vi.fn(async () => ({ id: '201', title: '历史入口短剧', episodes: [] })),
    findTikTokPublication: vi.fn(async () => null), listPublicationRecords, publicationRecordAction: vi.fn(),
  } as unknown as OperationsApi
  try {
    render(<OperationsConsole api={api} />)
    expect(screen.queryByRole('menuitem', { name: '官方审核记录' })).not.toBeInTheDocument()
    const drawer = await screen.findByRole('dialog')
    fireEvent.click(within(drawer).getByRole('button', { name: '审核记录' }))
    await waitFor(() => expect(window.location.pathname).toBe('/dramas/201/reviews'))
    expect(await screen.findByRole('heading', { name: '审核记录' })).toBeInTheDocument()
    expect(listPublicationRecords).toHaveBeenCalledWith('reviews', { page: 1, pageSize: 20, status: undefined, dramaId: '201' })
    expect(api.publicationRecordAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '返回官方发布' }))
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe('/official/publications?dramaId=201'))
    expect(await screen.findByRole('dialog')).toHaveTextContent('历史入口短剧 · 发布详情')
  } finally {
    session.menus.splice(0, session.menus.length, ...originalMenus)
  }
})

test.each([
  ['/official/publications', 'tiktok_minis', 'byteplus_web'],
  ['/dramas', 'byteplus_web', 'tiktok_minis'],
])('在 %s 复制时保留右上角实际选中的 %s/%s 应用标识', async (path, _pageProvider, playbackProvider) => {
  const originalPermissions=[...session.permissions], originalMenus=[...session.menus]
  session.permissions.push('applications.read','operations.campaign.create','operations.direct_publication.read')
  session.menus.push({id:'official',name:'官方发布',route:'/official/publications',children:[]},{id:'direct',name:'直连发布',route:'/direct/publications',children:[]})
  window.history.replaceState({dramaRouteIndex:0},'',path)
  const writeText=vi.fn(async()=>{})
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}})
  const ensureDramaCampaign=vi.fn(async()=>({landingUrl:'https://mini.example/current-app'}))
  catalog.dramas = [{id:'201',title:'线上内容',coverUrl:'',tags:[],status:'completed',year:2026,publishStatus:'draft',episodeCount:1,readyEpisodeCount:1,onlineVersion:7,directPublication:{status:'published',version:1,revision:1,pendingChanges:false,enabledApplications:1}}]
  catalog.catalogTotal = 1
  const api={
    getApplicationId:()=> '102',setApplicationId:vi.fn(),
    listApplications:vi.fn(async()=>[{id:'102',subjectId:'1',name:'Glimora',status:'active',playbackProvider} as Application]),
    listDramas:vi.fn(async()=>({total:1,items:[{id:'201',title:'线上内容',onlineVersion:7,directPublication:{status:'published',version:1,revision:1}}]})),
    directRequest:vi.fn(async()=>[{draft:{id:'201',title:'线上内容',publishStatus:'ready'},publication:{status:'published'}}]),
    ensureDramaCampaign,
  } as unknown as OperationsApi
  try {
    render(<OperationsConsole api={api} />)
    await screen.findByText('Glimora')
    const content = await screen.findByText('线上内容')
    // 限定目标行后单独验证可见性，避免 jsdom 对整行 AntD 节点反复计算继承样式。
    const button = within(content.closest('tr')!).getByRole('button', { name: '复制投放链接', hidden: true })
    expect(button).toBeVisible()
    expect(button).toBeEnabled()
    fireEvent.click(button)
    await waitFor(()=>expect(ensureDramaCampaign).toHaveBeenCalledExactlyOnceWith('201','102'))
    expect(writeText).toHaveBeenCalledWith('https://mini.example/current-app')
  } finally {
    session.permissions.splice(0,session.permissions.length,...originalPermissions)
    session.menus.splice(0,session.menus.length,...originalMenus)
  }
})

test.each([
  {path:'/direct/carousel',permission:'operations.direct_carousel.read',label:'直连轮播'},
  {path:'/direct/hot-dramas',permission:'operations.direct_hot.read',label:'直连热播'},
])('$label切换主体重新加载，迟到的旧主体配置不能覆盖当前内容',async ({path,permission,label})=>{
 const originalPermissions=[...session.permissions],originalMenus=[...session.menus]
 session.permissions.push(permission)
 session.menus.push({id:'direct-subject-view',name:label,route:path,children:[]})
 window.history.replaceState({dramaRouteIndex:0},'',path)
 let selected='1',finish!:(value:import('../homepage').CarouselView)=>void
 const oldResult=new Promise<import('../homepage').CarouselView>(resolve=>{finish=resolve})
 const config=(title:string):import('../homepage').CarouselView=>({revision:1,dramaIds:['201'],items:[{dramaId:'201',title,visible:true,createdAt:''}],dramas:[{id:'201',title,coverUrl:''}]})
 const read=vi.fn(()=>selected==='1'?oldResult:Promise.resolve(config('主体 B 推荐')))
 const direct={getCarousel:read,getHotDramas:read,carouselTargets:async()=>({items:[]}),hotDramaTargets:async()=>({items:[]})}
 const api={getSubjectId:()=>selected,setSubjectId:(id:string)=>{selected=id},getApplicationId:()=>'',setApplicationId:()=>{},listSubjectOptions:async()=>[{id:'1',name:'主体 A'},{id:'2',name:'主体 B'}],listApplicationOptions:async()=>[],directHomepage:()=>direct} as unknown as OperationsApi
 try {
  render(<OperationsConsole api={api}/>)
  await waitFor(()=>expect(read).toHaveBeenCalledTimes(1))
  fireEvent.mouseDown(screen.getByRole('combobox',{name:'当前主体'}))
  fireEvent.click(await screen.findByText('主体 B',{selector:'.ant-select-item-option-content'}))
  await waitFor(()=>expect(read).toHaveBeenCalledTimes(2))
  expect(await screen.findByRole('switch',{name:'展示 主体 B 推荐'})).toBeDisabled()
  expect(screen.getAllByText('主体 B 推荐').length).toBeGreaterThan(0)
  await act(async()=>finish(config('主体 A 迟到推荐')))
  await waitFor(()=>expect(screen.getAllByText('主体 B 推荐').length).toBeGreaterThan(0))
  expect(screen.queryByText('主体 A 迟到推荐')).not.toBeInTheDocument()
 }finally{session.permissions.splice(0,session.permissions.length,...originalPermissions);session.menus.splice(0,session.menus.length,...originalMenus)}
})

test('直连分类页在主体切换后重新查询，旧分类响应不能进入新主体',async()=>{
 const originalPermissions=[...session.permissions],originalMenus=[...session.menus]
 session.permissions.push('operations.direct_ranking.read')
 session.menus.push({id:'subject-ranking',name:'直连分类',route:'/direct/category-rankings',children:[]})
 window.history.replaceState({dramaRouteIndex:0},'','/direct/category-rankings')
 let selected='1',finish!:(value:import('../categoryRankings').RankingCategory[])=>void
 const pending=new Promise<import('../categoryRankings').RankingCategory[]>(resolve=>{finish=resolve})
 const rankingCategories=vi.fn(()=>selected==='1'?pending:Promise.resolve([{tag:{id:'21',officialName:'主体 B 分类',englishName:''},count:0}]))
 const direct={rankingCategories,categoryRanking:async()=>({revision:0,items:[],dramas:[]})}
 const api={getSubjectId:()=>selected,setSubjectId:(id:string)=>{selected=id},getApplicationId:()=>'',setApplicationId:()=>{},listSubjectOptions:async()=>[{id:'1',name:'主体 A'},{id:'2',name:'主体 B'}],listApplicationOptions:async()=>[],directHomepage:()=>direct} as unknown as OperationsApi
 try {
  render(<OperationsConsole api={api}/>)
  await waitFor(()=>expect(rankingCategories).toHaveBeenCalledTimes(1))
  fireEvent.mouseDown(screen.getByRole('combobox',{name:'当前主体'}))
  fireEvent.click(await screen.findByText('主体 B',{selector:'.ant-select-item-option-content'}))
  expect(await screen.findByRole('button',{name:'主体 B 分类 0'})).toBeInTheDocument()
  await act(async()=>finish([{tag:{id:'22',officialName:'主体 A 迟到分类',englishName:''},count:4}]))
  expect(rankingCategories).toHaveBeenCalledTimes(2)
  expect(screen.queryByText('主体 A 迟到分类')).not.toBeInTheDocument()
 } finally {session.permissions.splice(0,session.permissions.length,...originalPermissions);session.menus.splice(0,session.menus.length,...originalMenus)}
})

test('只有短剧分发权限也能使用安全应用选项预授权独立播放器应用', async () => {
  const originalPermissions = [...session.permissions], originalMenus = [...session.menus]
  session.permissions.splice(0, session.permissions.length, 'content.drama.read', 'content.drama.distribute')
  session.menus.push({ id: 'official-safe-options', name: '官方发布', route: '/official/publications', children: [] })
  window.history.replaceState({ dramaRouteIndex: 0 }, '', '/official/publications')
  const listApplications = vi.fn()
  const api = {
    getApplicationId: () => '101', getSubjectId: () => '1',
    listApplications,
    listApplicationOptions: async () => [
      { id: '101', subjectId: '1', name: '拥有方', tiktokAppId: '101', status: 'active', playbackProvider: 'tiktok_minis', clientKeyConfigured: true },
      { id: '102', subjectId: '1', name: '独立目标', tiktokAppId: '102', status: 'active', playbackProvider: 'byteplus_web', clientKeyConfigured: true },
      { id: '103', subjectId: '2', name: '其他主体', tiktokAppId: '103', status: 'active', playbackProvider: 'byteplus_web', clientKeyConfigured: true },
    ],
    listDramas: async () => ({ total: 1, items: [{ id: '201', title: '可分发内容', ownerApplicationId: '101', onlineVersion: 1, publicationStatus: 'online' }] }),
    listDramaDistributions: async () => [],
  } as unknown as OperationsApi
  try {
    render(<OperationsConsole api={api} />)
    fireEvent.click(await screen.findByRole('button', { name: '管理授权' }))
    const drawer = within(await screen.findByRole('dialog'))
    expect(await drawer.findByRole('checkbox', { name: '选择 独立目标' })).toBeEnabled()
    expect(drawer.queryByRole('checkbox', { name: '选择 其他主体' })).not.toBeInTheDocument()
    expect(listApplications).not.toHaveBeenCalled()
  } finally {
    session.permissions.splice(0, session.permissions.length, ...originalPermissions)
    session.menus.splice(0, session.menus.length, ...originalMenus)
  }
})
