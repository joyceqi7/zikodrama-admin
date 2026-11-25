import { expect, test } from 'vitest'
import type { AdminSession } from '../domain'
import { isApplicationScopedView, isViewAvailable, navigationItems, navigationSelectedKeys } from './navigation'

const user: AdminSession['user'] = { id: '1', username: 'reader', nickname: '只读', status: 'active', isSuper: false, roleIds: [], createdAt: '', updatedAt: '' }

test('剧目报表要求独立菜单与操作权限，不继承仪表盘权限且支持所有小程序', () => {
  const session: AdminSession = { user, permissions: ['operations.dashboard.read'], menus: [{ id: 'report', name: '剧目播放与解锁', route: '/channels/drama-report', children: [] }] }
  expect(isViewAvailable('dramaReport', session)).toBe(false)
  expect(isViewAvailable('dramaReport', { ...session, permissions: ['operations.drama_report.read'] })).toBe(true)
  expect(isViewAvailable('dramaReport', { ...session, permissions: ['operations.drama_report.read'], menus: [] })).toBe(false)
  expect(isApplicationScopedView('dramaReport')).toBe(false)
})

test('自定义名称、层级和顺序驱动导航', () => {
  const session: AdminSession = { user, permissions: ['content.drama.read', 'rbac.role.read'], menus: [{ id: 'root', name: '海外业务', route: '', children: [{ id: 'roles', name: '团队职责', route: 'roles', children: [] }, { id: 'dramas', name: '节目库', route: 'dramas', children: [] }] }] }
  expect(navigationItems(session)).toEqual([expect.objectContaining({ label: '海外业务', children: [expect.objectContaining({ label: '团队职责', key: 'roles:roles' }), expect.objectContaining({ label: '节目库' })] })])
})

test('菜单或操作缺少任意一项均不能打开页面', () => {
  expect(isViewAvailable('dramas', { user, permissions: ['content.drama.read'], menus: [] })).toBe(false)
  const session = { user, permissions: [], menus: [{ id: 'menu', name: '节目库', route: 'dramas', children: [] }] }
  expect(isViewAvailable('dramas', session)).toBe(false)
  expect(navigationItems(session)).toEqual([])
})

test('超级管理员在导航误删后仍可恢复权限树', () => {
  const session = { user: { ...user, isSuper: true }, permissions: [], menus: [] }
  expect(navigationItems(session)).toEqual([expect.objectContaining({ key: 'permissions:recovery', label: '权限' })])
})


test('标签菜单按独立读取权限显示', () => {
  const session: AdminSession = { user, permissions: ['content.drama.read', 'content.tiktok_tag.read'], menus: [{ id: 'tags', name: 'TikTok 标签', route: 'tiktokTags', children: [] }, { id: 'dramas', name: '短剧管理', route: 'dramas', children: [] }] }
  expect(navigationItems(session)).toEqual([expect.objectContaining({ label: 'TikTok 标签' }), expect.objectContaining({ label: '短剧管理' })])
})

test('观众用户列表同时要求菜单和独立读取权限，管理员读取权限不能替代', () => {
  const session: AdminSession = { user, permissions: ['operations.consumer_user.read'], menus: [{ id: 'consumer-users', name: '用户列表', route: 'consumerUsers', children: [] }] }
  expect(isViewAvailable('consumerUsers', session)).toBe(true)
  expect(isViewAvailable('consumerUsers', { ...session, menus: [] })).toBe(false)
  expect(isViewAvailable('consumerUsers', { ...session, permissions: ['rbac.user.read'] })).toBe(false)
})

test('旧会话中的消费指标菜单被忽略，仪表盘仍正常可用', () => {
 const session: AdminSession = { user, permissions: ['operations.metrics.read', 'operations.dashboard.read'], menus: [{id:'old',name:'消费指标',route:'metrics',children:[]},{id:'dashboard',name:'仪表盘',route:'dashboard',children:[]}] }
 expect(navigationItems(session)).toEqual([expect.objectContaining({label:'仪表盘'})])
})

test('回传日志要求独立菜单和读取权限，并归属应用范围', () => {
 const session: AdminSession = { user, permissions: ['operations.postback_log.read'], menus: [{ id: 'operations', name: '渠道管理', route: '', children: [{ id: 'postbacks', name: '回传日志', route: 'postbackLogs', children: [] }] }] }
 expect(isViewAvailable('postbackLogs', session)).toBe(true)
 expect(isApplicationScopedView('postbackLogs')).toBe(true)
 expect(navigationItems(session)).toEqual([expect.objectContaining({ label: '渠道管理', children: [expect.objectContaining({ label: '回传日志' })] })])
 expect(isViewAvailable('postbackLogs', { ...session, permissions: ['operations.dashboard.read'] })).toBe(false)
})

test('广告配置旧菜单不再显示，应用管理仍要求自身菜单和读取权限', () => {
  const session: AdminSession = { user, permissions: ['applications.read'], menus: [
    { id: 'ads', name: '广告配置', route: 'adConfiguration', children: [] },
    { id: 'ads-path', name: '广告配置', route: '/channels/ad-configuration', children: [] },
    { id: 'apps', name: '应用管理', route: '/channels/applications', children: [] },
  ] }
  expect(navigationItems(session)).toEqual([expect.objectContaining({ key: 'applications:apps' })])
  expect(isViewAvailable('applications', session)).toBe(true)
  expect(isViewAvailable('applications', { ...session, permissions: [] })).toBe(false)
  expect(isViewAvailable('applications', { ...session, menus: session.menus.slice(0, 2) })).toBe(false)
})

 test('短剧管理页面共享配置，广告和指标仍按应用隔离', () => {
  for (const view of ['dramas', 'tiktokTags', 'carousel', 'hotDramas', 'categoryRankings'] as const) expect(isApplicationScopedView(view)).toBe(false)
  for (const view of ['consumerUsers', 'dashboard', 'postbackLogs', 'campaigns'] as const) expect(isApplicationScopedView(view)).toBe(true)
 })


test('审核历史沿用官方发布菜单与读取权限，不再显示旧菜单；上线记录保留独立菜单', () => {
 const session: AdminSession = { user, permissions: ['content.drama.read'], menus: [
   { id: 'old', name: '官方审核记录', route: '/dramas/reviews', children: [] },
   { id: 'official', name: '官方发布', route: '/official/publications', children: [] },
 ] }
 expect(isViewAvailable('reviewRecords', session)).toBe(true)
 expect(isViewAvailable('reviewRecords', { ...session, permissions: [] })).toBe(false)
 expect(isViewAvailable('reviewRecords', { ...session, menus: [session.menus[0]] })).toBe(false)
 expect(isViewAvailable('reviewRecords', { ...session, menus: [{ id: 'dramas', name: '短剧管理', route: 'dramas', children: [] }] })).toBe(false)
 expect(navigationItems(session)).toEqual([expect.objectContaining({ key: 'officialPublications:official', label: '官方发布' })])
 expect(navigationSelectedKeys('reviewRecords', session)).toEqual(['officialPublications:official'])
 expect(isViewAvailable('releaseRecords', session)).toBe(false)
 const releases = { ...session, menus: [...session.menus, { id: 'releases', name: '官方上线记录', route: '/dramas/releases', children: [] }] }
 expect(isViewAvailable('releaseRecords', releases)).toBe(true)
 expect(navigationSelectedKeys('releaseRecords', releases)).toEqual(['releaseRecords:releases'])
})

test('链接奖励报表要求独立菜单与操作权限，自行选择全部或单应用', () => {
 const session: AdminSession = { user, permissions: ['operations.campaign_report.read'], menus: [{ id: 'campaign-report', name: '投放链接奖励贡献', route: 'campaignReport', children: [] }] }
 expect(isViewAvailable('campaignReport', session)).toBe(true)
 expect(isViewAvailable('campaignReport', { ...session, menus: [] })).toBe(false)
 expect(isViewAvailable('campaignReport', { ...session, permissions: ['operations.dashboard.read'] })).toBe(false)
 expect(isApplicationScopedView('campaignReport')).toBe(false)
})


test('旧会话中的直连发布和上线记录菜单都被忽略', () => {
  const session: AdminSession = { user, permissions: ['operations.direct_publication.read'], menus: [
    { id: 'old', name: '直连上线记录', route: '/direct/releases', children: [] },
    { id: 'publish', name: '直连发布', route: '/direct/publications', children: [] },
  ] }
  expect(navigationItems(session)).toEqual([])
})


test('广告统计是独立应用菜单，仪表盘或回传日志权限不授予读取能力', () => {
 const session: AdminSession = { user, permissions: ['operations.dashboard.read', 'operations.postback_log.read'], menus: [{ id: 'ads', name: '广告统计', route: '/channels/ad-analytics', children: [] }] }
 expect(isViewAvailable('adAnalytics', session)).toBe(false)
 expect(isViewAvailable('adAnalytics', { ...session, permissions: ['operations.ad_analytics.read'] })).toBe(true)
 expect(isViewAvailable('adAnalytics', { ...session, permissions: ['operations.ad_analytics.read'], menus: [] })).toBe(false)
 expect(isApplicationScopedView('adAnalytics')).toBe(true)
})


test('审核开关使用独立菜单和读取权限，并固定为应用范围', () => {
 const session: AdminSession = {user,permissions:['operations.review_settings.read'],menus:[{id:'review-switch',name:'审核开关',route:'/whitelist/review-settings',children:[]}]}
 expect(isViewAvailable('reviewSettings', session)).toBe(true)
 expect(isViewAvailable('reviewSettings', {...session,permissions:['applications.update']})).toBe(false)
 expect(isViewAvailable('reviewSettings', {...session,menus:[]})).toBe(false)
 expect(isApplicationScopedView('reviewSettings')).toBe(true)
 expect(navigationItems(session)).toEqual([expect.objectContaining({key:'reviewSettings:review-switch',label:'审核开关'})])
})

test('官方和直连审核列表分别鉴权，按主体渠道共享且不依赖应用选择', () => {
 const session: AdminSession = {user,permissions:['operations.direct_review_list.read'],menus:[
  {id:'direct-review',name:'审核列表',route:'/direct/review-list',children:[]},
  {id:'official-review',name:'审核列表',route:'/official/review-list',children:[]},
 ]}
 expect(isViewAvailable('directReviewList',session)).toBe(true)
 expect(isViewAvailable('officialReviewList',session)).toBe(false)
 expect(isApplicationScopedView('directReviewList')).toBe(false)
 expect(isApplicationScopedView('officialReviewList')).toBe(false)
 expect(navigationItems(session)).toHaveLength(1)
})
