import type { MenuProps } from 'antd'
import { Activity, BadgeDollarSign, Clapperboard, Folder, KeyRound, Library, Megaphone, PanelsTopLeft, ScrollText, Settings, Shield, Tags, Users, type LucideIcon } from 'lucide-react'
import { permissionCodes, type AdminSession } from '../domain'
import { viewForMenuRoute } from './routes'

// View 是后台固定页面标识。
export type View = 'reviewSettings' | 'officialReviewList' | 'directReviewList' | 'subjects' | 'officialPublications' | 'directPublications' | 'directCategoryRankings' | 'directCarousel' | 'directHotDramas' | 'campaignReport' | 'dramaReport' | 'reviewRecords' | 'releaseRecords' | 'categoryRankings' | 'hotDramas' | 'tiktokTags' | 'consumerUsers' | 'adAnalytics' | 'dashboard' | 'postbackLogs' | 'carousel' | 'globalConfigs' | 'dramas' | 'unlockStrategies' | 'campaigns' | 'applications' | 'users' | 'roles' | 'permissions' | 'audit'

// viewPermissions 声明页面读取数据所需的业务能力，菜单授权另由服务端配置。
export const viewPermissions: Record<View, string> = {
 reviewSettings:'operations.review_settings.read',
 officialReviewList:'operations.official_review_list.read',
 directReviewList:'operations.direct_review_list.read',
 subjects:permissionCodes.subjectRead,
 officialPublications:'content.drama.read',
 directPublications:'operations.direct_publication.read',
 directCategoryRankings:'operations.direct_ranking.read',
 directCarousel:'operations.direct_carousel.read',
 directHotDramas:'operations.direct_hot.read',

  reviewRecords: permissionCodes.dramaRead, releaseRecords: permissionCodes.dramaRead,
  categoryRankings: permissionCodes.rankingRead,
  tiktokTags: permissionCodes.tiktokTagRead,
  consumerUsers: permissionCodes.consumerUserRead,
  adAnalytics: permissionCodes.adAnalyticsRead,
  dashboard: permissionCodes.dashboardRead,
  dramaReport: permissionCodes.dramaReportRead,
  campaignReport: permissionCodes.campaignReportRead,
  postbackLogs: permissionCodes.postbackLogRead,
  carousel: permissionCodes.carouselRead,
  hotDramas: permissionCodes.hotRead,
  globalConfigs: permissionCodes.configRead,
  dramas: permissionCodes.dramaRead,
  unlockStrategies: permissionCodes.applicationRead,
  campaigns: permissionCodes.campaignRead,
  applications: permissionCodes.applicationRead,
  users: permissionCodes.userRead,
  roles: permissionCodes.roleRead,
  permissions: permissionCodes.permissionRead,
  audit: permissionCodes.auditRead,
}

// hasPermission 判断会话是否拥有指定操作权限。
export function hasPermission(session: AdminSession, permission: string): boolean {
  return session.user.isSuper || session.permissions.includes(permission)
}

// isApplicationScopedView 标记需要当前应用上下文的页面。
export function isApplicationScopedView(view: View): boolean {
	if (view === 'reviewSettings') return true
	return view === 'adAnalytics' || view === 'consumerUsers' || view === 'dashboard' || view === 'postbackLogs' || view === 'campaigns'
}

// viewLabels 是已实现页面的显示名称，菜单名称和层级由服务端配置。
export const viewLabels: Record<View, string> = {
 reviewSettings:'审核开关',
 officialReviewList:'审核列表',
 directReviewList:'审核列表',
 subjects:'主体管理',
 officialPublications:'官方发布',directPublications:'直连发布',directCategoryRankings:'直连分类',directCarousel:'直连轮播',directHotDramas:'直连热播',
  reviewRecords: '审核记录', releaseRecords: '上线记录',
  categoryRankings: '分类排行榜',
  consumerUsers: '用户列表',
  tiktokTags: 'TikTok 标签',
  adAnalytics: '广告统计',
  dashboard: '仪表盘',
  dramaReport: '剧目广告解锁贡献',
  campaignReport: '投放链接奖励贡献',
  postbackLogs: '回传日志',
  carousel: '轮播管理',
  hotDramas: '热播短剧',
  dramas: '短剧管理', applications: 'TikTok 应用',
  unlockStrategies: '解锁策略', campaigns: '投放配置',
  users: '用户', roles: '角色', permissions: '权限', globalConfigs: '配置管理', audit: '审计日志',
}

const viewIcons = { reviewSettings:Settings, officialReviewList:Shield, directReviewList:Shield, subjects:PanelsTopLeft, officialPublications:Clapperboard,directPublications:Clapperboard,directCategoryRankings:Tags,directCarousel:PanelsTopLeft,directHotDramas:Activity, campaignReport: Activity, dramaReport: Activity, reviewRecords: ScrollText, releaseRecords: Library, categoryRankings: Library, hotDramas: Library, consumerUsers: Users, tiktokTags: Tags, adAnalytics: Activity, dashboard: Activity, postbackLogs: ScrollText, carousel: PanelsTopLeft, dramas: Clapperboard, applications: PanelsTopLeft, unlockStrategies: BadgeDollarSign, campaigns: Megaphone, users: Users, roles: Shield, permissions: KeyRound, globalConfigs: Settings, audit: ScrollText }

// navigationIconOptions 是权限配置可选择的安全图标集合。
export const navigationIconOptions: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'activity', label: '折线', icon: Activity },
  { value: 'badge-dollar-sign', label: '钱币徽章', icon: BadgeDollarSign },
  { value: 'clapperboard', label: '场记板', icon: Clapperboard },
  { value: 'folder', label: '文件夹', icon: Folder },
  { value: 'key-round', label: '钥匙', icon: KeyRound },
  { value: 'library', label: '书架', icon: Library },
  { value: 'megaphone', label: '扩音器', icon: Megaphone },
  { value: 'panels-top-left', label: '面板', icon: PanelsTopLeft },
  { value: 'scroll-text', label: '文档', icon: ScrollText },
  { value: 'settings', label: '齿轮', icon: Settings },
  { value: 'shield', label: '盾牌', icon: Shield },
  { value: 'tags', label: '吊牌', icon: Tags },
  { value: 'users', label: '双人', icon: Users },
]

const navigationIcons = new Map(navigationIconOptions.map((item) => [item.value, item.icon]))

// isViewAvailable 同时要求菜单授权和业务读取权限；审核历史继承官方发布菜单，超级管理员保留权限配置恢复入口。
export function isViewAvailable(view: View, session: AdminSession): boolean {
  if (view === 'reviewRecords') return isViewAvailable('officialPublications', session)
  if (session.user.isSuper && view === 'permissions') return true
  const containsRoute = (menus: AdminSession['menus']): boolean => menus.some((menu) => viewForMenuRoute(menu.route) === view || containsRoute(menu.children))
  return hasPermission(session, viewPermissions[view]) && containsRoute(session.menus)
}

// navigationItems 使用服务端导航树，未知页面和无读取权限的菜单不会显示。
export function navigationItems(session: AdminSession | null): MenuProps['items'] {
  if (!session) return []
  const walk = (menus: AdminSession['menus'], depth: number): NonNullable<MenuProps['items']> => menus.flatMap<NonNullable<MenuProps['items']>[number]>((menu) => {
    const children = walk(menu.children, depth + 1)
    const view = viewForMenuRoute(menu.route)
    if (view && isViewAvailable(view, session)) {
      const Icon = navigationIcons.get(menu.icon || '') || viewIcons[view]
      return [{ key: `${view}:${menu.id}`, icon: <Icon size={18} />, label: menu.name }]
    }
    if (!children.length) return []
    const DirectoryIcon = navigationIcons.get(menu.icon || '') || Folder
    return [{ key: `directory:${menu.id}`, icon: <DirectoryIcon size={18} />, label: menu.name, children }]
  })
  const items = walk(session.menus, 0)
  const hasPermissionsMenu = (menus: AdminSession['menus']): boolean => menus.some((menu) => viewForMenuRoute(menu.route) === 'permissions' || hasPermissionsMenu(menu.children))
  // 自定义菜单误删或停用时，超级管理员仍可进入权限页修复配置。
  if (session.user.isSuper && !hasPermissionsMenu(session.menus)) items.push({ key: 'permissions:recovery', icon: <KeyRound size={18} />, label: '权限' })
  return items
}

// navigationSelectedKeys 支持同一页面在多个自定义目录中出现，避免使用重复菜单键。
export function navigationSelectedKeys(view: View, session: AdminSession | null): string[] {
  // 审核历史属于官方发布，查看记录时仍选中来源菜单。
  if (view === 'reviewRecords') return navigationSelectedKeys('officialPublications', session)
  const walk = (menus: AdminSession['menus']): string[] => menus.flatMap((menu) => [...(viewForMenuRoute(menu.route) === view ? [`${view}:${menu.id}`] : []), ...walk(menu.children)])
  return [...walk(session?.menus || []), ...(view === 'permissions' && session?.user.isSuper ? ['permissions:recovery'] : [])]
}
