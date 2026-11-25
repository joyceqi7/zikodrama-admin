import type { View } from './navigation'

// ConsoleRoute 描述地址栏可恢复的后台页面；短剧详情标识始终按字符串编码。
export type ConsoleRoute =
  | { view: 'home'; screen: 'menu' }
  | { view: View; screen: 'menu' }
  /** 官方详情仍属于发布列表，使用查询参数恢复抽屉选择。 */
  | { view: 'officialPublications'; screen: 'target'; dramaId: string }
  | { view: 'dramas'; screen: 'create' }
  | { view: 'dramas'; screen: 'edit'; dramaId: string }
  | { view: 'reviewRecords' | 'releaseRecords'; screen: 'records'; dramaId?: string }

// viewPaths 是稳定的菜单地址，不依赖服务端菜单名称和目录层级。
export const viewPaths: Record<View, string> = {
 subjects:'/channels/subjects',
 officialPublications:'/official/publications',
 directPublications:'/direct/publications',
 directCategoryRankings:'/direct/category-rankings',
 directCarousel:'/direct/carousel',
 directHotDramas:'/direct/hot-dramas',

  dramas: '/dramas',
  reviewRecords: '/dramas/reviews',
  releaseRecords: '/dramas/releases',
  categoryRankings: '/content/category-rankings',
  hotDramas: '/content/hot-dramas',
  carousel: '/content/carousel',
  tiktokTags: '/content/tiktok-tags',
  applications: '/channels/applications',
  reviewSettings: '/whitelist/review-settings',
  officialReviewList: '/official/review-list',
  directReviewList: '/direct/review-list',
  adAnalytics: '/channels/ad-analytics',
  dashboard: '/channels/dashboard',
  dramaReport: '/channels/drama-report',
  campaignReport: '/channels/campaign-report',
  consumerUsers: '/channels/users',
  postbackLogs: '/channels/postback-logs',
  campaigns: '/channels/campaigns',
  unlockStrategies: '/monetization/unlock-strategy',
  users: '/system/users',
  roles: '/system/roles',
  permissions: '/system/permissions',
  globalConfigs: '/system/configuration',
  audit: '/system/audit-log',
}

// viewForMenuRoute 将服务端菜单路径解析为页面；发布期间继续识别旧页面标识。
export function viewForMenuRoute(route: string): View | undefined {
  // 审核历史只从官方发布详情进入，旧会话或自定义菜单不能恢复独立入口。
  if (route === 'reviewRecords' || route === viewPaths.reviewRecords || route === 'directPublications' || route === viewPaths.directPublications) return undefined
  const pathEntry = Object.entries(viewPaths).find(([, path]) => path === route)
  if (pathEntry) return pathEntry[0] as View
  return Object.hasOwn(viewPaths, route) ? route as View : undefined
}

// canonicalMenuPath 将旧页面标识转换为表单和列表使用的规范路径。
export function canonicalMenuPath(route: string): string {
  const view = viewForMenuRoute(route)
  return view ? viewPaths[view] : route
}

// menuRoute 返回菜单页面对应的规范路由。
export function menuRoute(view: View): ConsoleRoute {
  if (view === 'directPublications') return { view: 'dramas', screen: 'menu' }
  // 旧的全局审核记录地址返回官方列表；带短剧标识的只读历史路由继续保留。
  if (view === 'reviewRecords') return { view: 'officialPublications', screen: 'menu' }
  if (view === 'releaseRecords') return { view, screen: 'records' }
  return { view, screen: 'menu' }
}

// consoleRoutePath 把后台路由转换为可复制、可刷新的绝对路径。
export function consoleRoutePath(route: ConsoleRoute): string {
  if (route.view === 'home') return '/'
  if(route.screen === 'target') return `/official/publications?${new URLSearchParams({dramaId:route.dramaId})}`
  if (route.screen === 'create') return '/dramas/new'
  if (route.screen === 'edit') return `/dramas/${encodeURIComponent(route.dramaId)}/edit`
  if (route.screen === 'records' && route.dramaId) {
    return `/dramas/${encodeURIComponent(route.dramaId)}/${route.view === 'reviewRecords' ? 'reviews' : 'releases'}`
  }
  return viewPaths[route.view]
}

// parseConsoleRoute 只接受后台已声明的规范路径，未知地址交由权限回退处理。
export function parseConsoleRoute(pathname: string): ConsoleRoute | null {
  const [pathnameOnly, search = ''] = pathname.split('?')
  const path = normalizePath(pathnameOnly)
  // 广告位入口已合并到应用管理，历史书签继续落到可用的列表页。
  if (path === '/channels/ad-configuration') return menuRoute('applications')
  if (path === '/') return { view: 'home', screen: 'menu' }
  if (path === viewPaths.officialPublications) {
    const dramaId = new URLSearchParams(search).get('dramaId')
    if (dramaId && !dramaId.includes('/')) return {view:'officialPublications',screen:'target',dramaId}
  }
  const menuEntry = Object.entries(viewPaths).find(([, candidate]) => candidate === path)
  if (menuEntry) return menuRoute(menuEntry[0] as View)
  if (path === '/dramas/new') return { view: 'dramas', screen: 'create' }

  const official = /^\/official\/dramas\/([^/]+)\/publication$/.exec(path)
  // 历史发布工作台地址统一恢复到列表详情，不再保留二级发布页面。
  if(official){const dramaId=decodeSegment(official[1]);return dramaId?{view:"officialPublications",screen:"target",dramaId}:null}
  const detail = /^\/dramas\/([^/]+)\/(edit|publication|reviews|releases)$/.exec(path)
  if (!detail) return null
  const dramaId = decodeSegment(detail[1])
  if (!dramaId) return null
  if (detail[2] === 'edit') return { view: 'dramas', screen: 'edit', dramaId }
  if (detail[2] === 'publication') return {view:'officialPublications',screen:'target',dramaId}
  return { view: detail[2] === 'reviews' ? 'reviewRecords' : 'releaseRecords', screen: 'records', dramaId }
}

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/'
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
}

function decodeSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value)
    return decoded && !decoded.includes('/') ? decoded : null
  } catch {
    return null
  }
}
