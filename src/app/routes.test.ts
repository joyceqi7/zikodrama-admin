import { describe, expect, test } from 'vitest'
import { canonicalMenuPath, consoleRoutePath, menuRoute, parseConsoleRoute, viewForMenuRoute, viewPaths } from './routes'

describe('后台路由', () => {
  test('根地址是独立工作台，不绑定业务菜单', () => {
    expect(parseConsoleRoute('/')).toEqual({ view: 'home', screen: 'menu' })
    expect(consoleRoutePath({ view: 'home', screen: 'menu' })).toBe('/')
    expect(viewForMenuRoute('/')).toBeUndefined()
  })

  test('所有菜单地址都能无损解析', () => {
    for (const [view, path] of Object.entries(viewPaths)) {
      expect(parseConsoleRoute(path)).toEqual(menuRoute(view as Parameters<typeof menuRoute>[0]))
    }
  })

  test('短剧工作流地址编码字符串标识，并拒绝未知地址', () => {
    const route = { view: 'dramas', screen: 'edit', dramaId: 'drama 001' } as const
    expect(consoleRoutePath(route)).toBe('/dramas/drama%20001/edit')
    expect(parseConsoleRoute('/dramas/drama%20001/edit')).toEqual(route)
    expect(parseConsoleRoute('/dramas/drama%2F001/edit')).toBeNull()
    expect(parseConsoleRoute('/unknown')).toBeNull()
  })

  test('菜单使用页面路径并兼容旧页面标识', () => {
    expect(viewForMenuRoute('/channels/postback-logs')).toBe('postbackLogs')
    expect(viewForMenuRoute('postbackLogs')).toBe('postbackLogs')
    expect(canonicalMenuPath('postbackLogs')).toBe('/channels/postback-logs')
    expect(viewForMenuRoute('/unknown')).toBeUndefined()
  })
})

test('官方列表详情链接及旧工作台地址保留对应菜单身份',()=>{
 const route={view:'officialPublications',screen:'target',dramaId:'9007199254740993'} as const
 expect(parseConsoleRoute(consoleRoutePath(route))).toEqual(route)
 expect(parseConsoleRoute('/official/dramas/9007199254740993/publication')).toEqual(route)
 expect(parseConsoleRoute('/dramas/9007199254740993/publication')).toEqual(route)
})


test('重复的直连上线记录页面不再注册', () => {
  expect(viewForMenuRoute('/direct/releases')).toBeUndefined()
  expect(viewForMenuRoute('directReleases')).toBeUndefined()
  expect(parseConsoleRoute('/direct/releases')).toBeNull()
  expect(parseConsoleRoute('/direct/dramas/201/publication')).toBeNull()
  expect(parseConsoleRoute('/direct/dramas/201/releases')).toBeNull()
})

test('全局审核记录地址回官方列表，剧目历史地址仍可恢复且不能绑定菜单', () => {
  expect(viewForMenuRoute('/dramas/reviews')).toBeUndefined()
  expect(viewForMenuRoute('reviewRecords')).toBeUndefined()
  expect(parseConsoleRoute('/dramas/reviews')).toEqual({ view: 'officialPublications', screen: 'menu' })
  const route = { view: 'reviewRecords', screen: 'records', dramaId: '9007199254740993' } as const
  expect(parseConsoleRoute(consoleRoutePath(route))).toEqual(route)
})


test('广告配置旧地址回到应用管理，不能再绑定独立菜单', () => {
  expect(viewForMenuRoute('adConfiguration')).toBeUndefined()
  expect(viewForMenuRoute('/channels/ad-configuration')).toBeUndefined()
  expect(parseConsoleRoute('/channels/ad-configuration')).toEqual({ view: 'applications', screen: 'menu' })
})


test('审核开关和审核内容清单分别有独立可恢复地址', () => {
 expect(viewForMenuRoute('/whitelist/review-settings')).toBe('reviewSettings')
 expect(parseConsoleRoute('/whitelist/review-settings')).toEqual({view:'reviewSettings',screen:'menu'})
 expect(viewForMenuRoute('/official/review-list')).toBe('officialReviewList')
 expect(viewForMenuRoute('/direct/review-list')).toBe('directReviewList')
})
