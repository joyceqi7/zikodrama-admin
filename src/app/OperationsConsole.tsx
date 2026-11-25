import type { ApplicationOption } from '../applications'
import type { SubjectOption } from '../subjects'
import { resolveSubjectSelection, type SubjectSelection } from './subjectSelection'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, Card, ConfigProvider, Drawer, Flex, Grid, Layout, Menu, Modal, Select, Space, Tooltip, Typography, message } from 'antd'
import { Clapperboard, PanelLeft, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { type OperationsApi } from '../api'
import { permissionCodes, type Application } from '../domain'
import { toUserMessage } from '../userMessage'
import { reportOperationFailure } from '../operationErrors'
import { LoginView } from '../features/auth/LoginView'
import type { DirectMediaUploader } from '../media/byteplusUploader'
import { createBytePlusUploader } from '../media/byteplusUploader'
import { createUploadActivityStore } from '../media/uploadActivity'
import { UploadActivityIndicator } from '../components/UploadActivityIndicator'

import { consoleTheme } from './theme'
import { hasPermission, isViewAvailable, navigationItems, navigationSelectedKeys, viewPermissions, type View } from './navigation'
import { ReviewSettingsManagement } from '../features/applications/ReviewSettingsManagement'
import { ReviewWhitelistManagement } from '../features/applications/ReviewWhitelistManagement'
import { ConsoleHome } from './ConsoleHome'
import { useAdminSession } from '../features/auth/useAdminSession'
import { useDramaCatalog } from '../features/dramas/useDramaCatalog'
import { consoleRoutePath, menuRoute, parseConsoleRoute } from './routes'
import { useConsoleRouter } from './useConsoleRouter'
// 按实际访问页面加载业务代码，登录首屏无需下载编辑、发布和系统管理模块。
const GlobalConfigManagement = lazy(() => import('../features/system/GlobalConfigManagement').then((module) => ({ default: module.GlobalConfigManagement })))
const TikTokTagManagement = lazy(() => import('../features/dramas/TikTokTagManagement').then((module) => ({ default: module.TikTokTagManagement })))
const Dashboard = lazy(() => import('../features/dramas/Dashboard').then((module) => ({ default: module.Dashboard })))
const UnlockStrategyManagement = lazy(() => import('../features/monetization/UnlockStrategyManagement').then((module) => ({ default: module.UnlockStrategyManagement })))
const DramaEditor = lazy(() => import('../features/dramas/DramaEditor').then((module) => ({ default: module.DramaEditor })))
const PermissionManagement = lazy(() => import('../features/system/PermissionManagement').then((module) => ({ default: module.PermissionManagement })))
const RoleManagement = lazy(() => import('../features/system/RoleManagement').then((module) => ({ default: module.RoleManagement })))
const UserManagement = lazy(() => import('../features/system/UserManagement').then((module) => ({ default: module.UserManagement })))
const AuditLog = lazy(() => import('../features/system/AuditLog').then((module) => ({ default: module.AuditLog })))
const CampaignReportPage = lazy(() => import('../features/growth/CampaignReportPage').then(module => ({ default: module.CampaignReportPage })))
const DramaReportPage = lazy(() => import('../features/growth/DramaReportPage').then(module => ({ default: module.DramaReportPage })))
const AdAnalyticsPage = lazy(() => import('../features/growth/AdAnalyticsPage').then(module => ({ default: module.AdAnalyticsPage })))
const AnalyticsDashboard = lazy(() => import('../features/growth/AnalyticsDashboard').then((module) => ({ default: module.AnalyticsDashboard })))
const TikTokPostbackLogList = lazy(() => import('../features/growth/TikTokPostbackLogList').then((module) => ({ default: module.TikTokPostbackLogList })))
const ConsumerUserList = lazy(() => import('../features/growth/ConsumerUserList').then((module) => ({ default: module.ConsumerUserList })))
const SubjectManagement = lazy(() => import('../features/applications/SubjectManagement').then(module => ({default:module.SubjectManagement})))
const ApplicationManagement = lazy(() => import('../features/applications/ApplicationManagement').then((module) => ({ default: module.ApplicationManagement })))
const CategoryRankingManagement = lazy(() => import('../features/dramas/CategoryRankingManagement').then(module => ({ default: module.CategoryRankingManagement })))
const CarouselManagement = lazy(() => import('../features/dramas/CarouselManagement').then((module) => ({ default: module.CarouselManagement })))
const CampaignManagement = lazy(() => import('../features/growth/CampaignManagement').then((module) => ({ default: module.CampaignManagement })))
const PublicationRecordsPage = lazy(() => import('../features/dramas/PublicationRecordsPage').then((module) => ({ default: module.PublicationRecordsPage })))

const OfficialPublicationManagement=lazy(()=>import('../features/dramas/OfficialPublicationManagement').then(module=>({default:module.OfficialPublicationManagement})))

// OperationsConsoleProps 是外壳的运行依赖。
export interface OperationsConsoleProps {
  // api 提供已配置的管理接口。
  api: OperationsApi
  // directUploader 允许注入直传适配器。
  directUploader?: DirectMediaUploader
}

// OperationsConsole 组合会话、导航和业务页面；短剧状态由领域 Hook 管理。
export function OperationsConsole({ api, directUploader }: OperationsConsoleProps) {
  const directHomepageApi=useMemo(()=>api.directHomepage?.() ?? api,[api])
  const [messageApi, messageContext] = message.useMessage()
  const [strategyDraft, setStrategyDraft] = useState({ dirty: false, saving: false })
  const [pendingStrategyLeave, setPendingStrategyLeave] = useState<(() => void) | null>(null)
  const updateStrategyDraft = useCallback((dirty: boolean, saving: boolean) => setStrategyDraft({ dirty, saving }), [])
  const [applications, setApplications] = useState<Application[]>([])
  const [applicationOptions, setApplicationOptions] = useState<ApplicationOption[]>([])
  const [subjects, setSubjects] = useState<SubjectOption[]>([])
  const [selection, setSelection] = useState<SubjectSelection>(() => ({subjectId:api.getSubjectId(),applicationId:api.getApplicationId()}))
  const selectionRef = useRef(selection)
  selectionRef.current = selection
  const selectionLoad = useRef(0)
  const selectedSubjectId = selection.subjectId
  const selectedApplicationId = selection.applicationId
  const [selectionReady,setSelectionReady]=useState(false)
  const [applicationsLoading, setApplicationsLoading] = useState(false)
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)
  // 首次进入只显示目录，后续展开状态由用户手动控制。
  const [openNavigationKeys, setOpenNavigationKeys] = useState<string[]>([])
  const [navigationCollapsed, setNavigationCollapsed] = useState(false)
  const screens = Grid.useBreakpoint()
  const compactNavigation = screens.lg === false
  const uploadActivity = useMemo(() => createUploadActivityStore(directUploader ?? createBytePlusUploader()), [directUploader])

  const notify = useCallback(
    (content: string, tone: 'success' | 'error' = 'success') => {
      void messageApi.open({ type: tone, content })
    },
    [messageApi],
  )

  const handleBlockedHistory = useCallback((continueNavigation: () => void) => setPendingStrategyLeave(() => continueNavigation), [])
  const handleSavingHistory = useCallback(() => notify('配置正在保存，请稍候'), [notify])
  const { route, pathname, navigate } = useConsoleRouter({
    blocked: strategyDraft.dirty,
    saving: strategyDraft.saving,
    onBlocked: handleBlockedHistory,
    onSavingBlocked: handleSavingHistory,
  })
  const view = route?.view ?? 'home'

  const { authenticated, session, setAuthenticated, loginBusy, loginError, login, endSession, refreshSession } = useAdminSession(api, notify)

  const { dramas, catalogQuery, setCatalogQuery, catalogTotal, loading, dramaEditor, setDramaEditor, load, openDrama, updateDrama, deleteDrama, resetCatalog } = useDramaCatalog(api, notify, setAuthenticated)

  const installSelection = useCallback((next:SubjectSelection) => {
    // 先同步 API 的两个选择，再触发页面更新，不允许请求使用不同主体的旧应用。
    if(selectionRef.current.subjectId!==next.subjectId) {
      resetCatalog()
      // 剧目已按主体独立；切换后退出带旧主键的页面，不能向新主体重新请求旧详情。
      const current = parseConsoleRoute(window.location.pathname + window.location.search)
      if (selectionRef.current.subjectId && current && (current.screen === 'edit' || current.screen === 'target' || current.screen === 'records' && current.dramaId)) navigate(menuRoute(current.view), { replace: true })
    }
    selectionRef.current=next
    api.setSubjectId(next.subjectId)
    api.setApplicationId(next.applicationId)
    setSelection(next)
  },[api,resetCatalog,navigate])

  const can = useCallback((permission: string) => session?.user.isSuper === true || session?.permissions.includes(permission) === true, [session])
  const canLegacyOr = useCallback((permission: string) => can(permission) || can(permissionCodes.dramaPublish), [can])

  const loadApplications = useCallback(async () => {
    const version=++selectionLoad.current
    setApplicationsLoading(true)
    try {
      const [next, options] = await Promise.all([can(permissionCodes.applicationRead) ? api.listApplications() : api.listApplicationOptions(),api.listSubjectOptions()])
      if(version!==selectionLoad.current)return
      setApplicationOptions(next)
      if(can(permissionCodes.applicationRead))setApplications(next as Application[])
      setSubjects(options)
      setSelectionReady(true)
      installSelection(resolveSubjectSelection(options,next,selectionRef.current))
    } catch (error) {
      if(version!==selectionLoad.current)return
      reportOperationFailure('加载主体和应用选项失败', error)
      notify(errorMessage(error), 'error')
    } finally {
      if(version===selectionLoad.current)setApplicationsLoading(false)
    }
  }, [api, notify,installSelection,can])

  const cancelSelectionLoad=useCallback(()=>{selectionLoad.current++},[])

  // 默认入口不依赖业务菜单顺序；无效或失权地址返回工作台，已授权深链接仍按原地址打开。
  useEffect(() => {
    if (!authenticated || !session) return
    if (!route || (route.view !== 'home' && !isViewAvailable(route.view, session))) navigate({ view: 'home', screen: 'menu' }, { replace: true })
    else if (consoleRoutePath(route) !== pathname) navigate(route, {replace:true})
  }, [authenticated, navigate, pathname, route, session])
  const inBusinessPage = !!route && route.view !== 'home' && !!session && isViewAvailable(route.view, session)
  useEffect(() => {
    if (authenticated && session && selectionReady && selectedSubjectId && inBusinessPage && hasPermission(session, permissionCodes.dramaRead)) void load()
  }, [authenticated, session, selectionReady, inBusinessPage, load,selectedSubjectId])
  useEffect(() => {
    if (authenticated && session) void loadApplications()
    else {setSelectionReady(false);setSubjects([]);setApplicationOptions([]);setApplications([])}
    return ()=>{cancelSelectionLoad()}
  }, [authenticated, session, loadApplications,cancelSelectionLoad])

  // URL 是页面选择的唯一来源；编辑详情按需读取，官方发布详情由列表抽屉恢复。
  useEffect(() => {
    if (!authenticated || !session || !selectionReady || !selectedSubjectId || !route || (route.view !== 'home' && !isViewAvailable(route.view, session))) return
    let active = true
    const restoreRoute = async () => {
      if (route.screen === 'create') {
        if (dramaEditor?.mode !== 'create') setDramaEditor({ mode: 'create' })
        return
      }
      if (route.screen === 'edit') {
        if (dramaEditor?.mode === 'edit' && dramaEditor.drama.id === route.dramaId) return
        if (!await openDrama({ id: route.dramaId }) && active) navigate(menuRoute('dramas'), { replace: true })
        return
      }
      setDramaEditor(null)
    }
    void restoreRoute()
    return () => { active = false }
  }, [authenticated, dramaEditor, navigate, openDrama, route, session, selectionReady, selectedSubjectId, setDramaEditor])

  const logout = () => {
    endSession()
    resetCatalog()
    selectionLoad.current++
    setApplications([])
    setSubjects([])
    setApplicationOptions([])
    navigate({ view: 'home', screen: 'menu' }, { replace: true })
  }

  const recordDramaId = route?.screen === 'records' ? route.dramaId : undefined
  const showAdAnalytics = !!session && isViewAvailable('adAnalytics', session)
  const showDashboard = !!session && isViewAvailable('dashboard', session)
  const showPostbackLogs = !!session && isViewAvailable('postbackLogs', session)
  const showCategoryRankings = !!session && isViewAvailable('categoryRankings', session)
  const showHotDramas = !!session && isViewAvailable('hotDramas', session)
  const showCarousel = !!session && isViewAvailable('carousel', session)
  const showTikTokTags = !!session && isViewAvailable('tiktokTags', session)
  const showDramas = !!session && isViewAvailable('dramas', session)
  const showApplications = !!session && isViewAvailable('applications', session)
  const showUnlockStrategies = !!session && isViewAvailable('unlockStrategies', session)
  const showConsumerUsers = !!session && isViewAvailable('consumerUsers', session)
  const showCampaigns = !!session && isViewAvailable('campaigns', session)
  const showUsers = !!session && isViewAvailable('users', session)
  const showRoles = !!session && isViewAvailable('roles', session)
  const showPermissions = !!session && isViewAvailable('permissions', session)
  const showGlobalConfigs = !!session && isViewAvailable('globalConfigs', session)
  const showAudit = !!session && isViewAvailable('audit', session)
  const selectedApplication = applications.find((item) => item.id === selectedApplicationId)
  const selectedOption = applicationOptions.find(app=>app.id===selectedApplicationId)
  const selectedApplicationName = selectedApplication?.name || selectedOption?.name || '未选择应用'

  const switchApplication = (applicationId: string) => {
    if(!applicationOptions.some(app=>app.id===applicationId&&app.subjectId===selectedSubjectId))return
    installSelection({subjectId:selectedSubjectId,applicationId})
  }

  const applicationChanged=(application:Application)=>{
    const replace=<T extends ApplicationOption>(items:T[],value:T)=>items.some(item=>item.id===value.id)?items.map(item=>item.id===value.id?value:item):[...items,value]
    setApplications(current=>replace(current,application))
    const next=replace(applicationOptions,application)
    setApplicationOptions(next)
    installSelection(resolveSubjectSelection(subjects,next,selectionRef.current))
  }

  const subjectApplications=applications.filter(app=>app.subjectId===selectedSubjectId)
  // 官方分发只需要应用安全摘要，不能隐式依赖应用资料读取权限。
  const distributionApplications=can(permissionCodes.applicationRead)?subjectApplications:applicationOptions.filter(app=>app.subjectId===selectedSubjectId)
  const switchSubject=(subjectId:string)=>installSelection(resolveSubjectSelection(subjects,applicationOptions,{subjectId,applicationId:selectedApplicationId}))

  const menuItems = useMemo(() => navigationItems(session), [session])

  useEffect(() => {
    if (!compactNavigation) setMobileNavigationOpen(false)
  }, [compactNavigation])

  if (!authenticated)
    return (
      <ConfigProvider theme={consoleTheme}>
        {messageContext}
        <LoginView busy={loginBusy} error={loginError} onLogin={login} />
      </ConfigProvider>
    )

  // 完整页面编辑时，菜单切换和退出也必须经过草稿保护。
  const leaveStrategy = (action: () => void) => {
    if ((view === 'unlockStrategies' || view === 'applications') && strategyDraft.saving) { notify('配置正在保存，请稍候'); return }
    if ((view === 'unlockStrategies' || view === 'applications') && strategyDraft.dirty) { setPendingStrategyLeave(() => action); return }
    action()
  }

  const openHome = () => leaveStrategy(() => {
    navigate({ view: 'home', screen: 'menu' })
    setMobileNavigationOpen(false)
  })

  const navigation = (
    <Menu
      aria-label="主导航"
      theme="light"
      mode="inline"
      selectedKeys={view === 'home' ? [] : navigationSelectedKeys(view, session)}
      items={menuItems}
      openKeys={navigationCollapsed && !compactNavigation ? [] : openNavigationKeys}
      onOpenChange={(keys) => {
        // 整栏收起产生的清空事件不能丢失用户选择的目录展开状态。
        if (compactNavigation || !navigationCollapsed) setOpenNavigationKeys(keys)
      }}
      onClick={({ key }) => {
        const target = key.split(':')[0] as View
        if (!session || !Object.hasOwn(viewPermissions, target) || !isViewAvailable(target, session)) return
        const targetRoute = menuRoute(target)
        if (consoleRoutePath(targetRoute) === pathname) { setMobileNavigationOpen(false); return }
        leaveStrategy(() => {
          navigate(targetRoute)
          setMobileNavigationOpen(false)
        })
      }}
    />
  )

  return (
    <ConfigProvider theme={consoleTheme}>
    <Layout className="operations-shell" hasSider={!compactNavigation}>
      {messageContext}
      {compactNavigation ? (
        <Drawer
          rootClassName="operations-navigation-drawer"
          title={
            <a href="/" aria-label="返回工作台" onClick={(event) => { event.preventDefault(); openHome() }}>
            <Space>
              <Clapperboard size={20} />
              <Typography.Text strong>Drama 短剧后台管理</Typography.Text>
            </Space>
            </a>
          }
          placement="left"
          size={280}
          open={mobileNavigationOpen}
          onClose={() => setMobileNavigationOpen(false)}
        >
          {navigation}
        </Drawer>
      ) : (
        <Layout.Sider className="operations-sider" theme="light" width={216} collapsible collapsed={navigationCollapsed} onCollapse={setNavigationCollapsed}>
          <a className="console-brand" href="/" aria-label="返回工作台" onClick={(event) => { event.preventDefault(); openHome() }}>
            <span className="console-brand-mark" aria-hidden="true"><Clapperboard size={19} strokeWidth={1.9} /></span>
            <span className="console-brand-copy"><strong>Drama</strong><small>短剧运营</small></span>
          </a>
          <div className="operations-navigation-scroll">{navigation}</div>
        </Layout.Sider>
      )}

      <Layout className="operations-main">
        <Layout.Header className="operations-header">
          <Flex align="center" justify="space-between">
            <Flex align="center" gap={12}>
              {compactNavigation ? (
                <Tooltip title="主导航">
                  <Button type="text" icon={<PanelLeft size={19} />} onClick={() => setMobileNavigationOpen(true)} aria-label="打开主导航" />
                </Tooltip>
              ) : (
                <Tooltip title={navigationCollapsed ? '展开主导航' : '折叠主导航'}>
                  <Button type="text" icon={navigationCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />} onClick={() => setNavigationCollapsed((current) => !current)} aria-label={navigationCollapsed ? '展开主导航' : '折叠主导航'} aria-expanded={!navigationCollapsed} />
                </Tooltip>
              )}
              <div className="operations-identity">
                <Typography.Text strong>短剧运营</Typography.Text>
                <Typography.Text type="secondary">内容 · 变现 · 投放</Typography.Text>
              </div>
            </Flex>
            <Flex className="operations-account" align="center" gap={16}>
              <UploadActivityIndicator store={uploadActivity} compact={compactNavigation} />
              {<Select className="operations-subject-switcher" aria-label="当前主体" value={selectedSubjectId || undefined} loading={applicationsLoading} disabled={applicationsLoading || !subjects.length} placeholder="请选择主体" options={subjects.map(subject=>({value:subject.id,label:subject.name}))} onChange={id=>leaveStrategy(()=>switchSubject(id))} />}
              {(
                <Select
                  className="operations-application-switcher"
                  aria-label="当前应用"
                  value={selectedApplicationId || undefined}
                  loading={applicationsLoading}
                  disabled={applicationsLoading || !applicationOptions.some(app=>app.subjectId===selectedSubjectId)}
                  placeholder={applicationsLoading ? '加载应用中' : '该主体暂无应用'}
                  showSearch={{ optionFilterProp: 'label' }}
                  popupMatchSelectWidth={compactNavigation ? 200 : 280}
                  classNames={{ popup: { root: 'operations-application-options' } }}
                  placement="bottomRight"
                  options={applicationOptions.filter(app=>app.subjectId===selectedSubjectId).map((application) => ({
                    value: application.id,
                    label: `${application.name} · ${application.tiktokAppId}`,
                    name: application.name,
                    status: application.status,
                  }))}
                  labelRender={() => (
                    <span className="operations-application-label" title={`${selectedApplicationName}（${selectedOption?.status === 'active' ? '启用' : '停用'}）`}>
                      <Badge status={selectedOption?.status === 'active' ? 'success' : 'default'} />
                      <span>{selectedApplicationName}</span>
                    </span>
                  )}
                  optionRender={({ data }) => (
                    <Flex vertical gap={2}>
                      <Flex align="center" gap={8}><Badge status={data.status === 'active' ? 'success' : 'default'} /><span>{data.name}</span><Typography.Text type="secondary">{data.status === 'active' ? '启用' : '停用'}</Typography.Text></Flex>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{data.label}</Typography.Text>
                    </Flex>
                  )}
                  // 全局切换沿用应用隔离上下文；策略草稿仍遵守离开保护。
                  onChange={(applicationId) => leaveStrategy(() => switchApplication(applicationId))}
                />
              )}
              <Flex className="operations-user" align="center" gap={12}>
                <span className="operations-user-avatar" aria-hidden="true">{(session?.user.nickname || session?.user.username || '').slice(0, 1).toUpperCase()}</span>
                {!compactNavigation && <Typography.Text type="secondary">{session?.user.nickname || session?.user.username}</Typography.Text>}
                <Button size="small" onClick={() => leaveStrategy(logout)} aria-label="退出登录">
                  退出登录
                </Button>
              </Flex>
            </Flex>
          </Flex>
        </Layout.Header>
        <Layout.Content className="operations-content">
          <Card
            className="workspace-surface"
            aria-label="后台工作区"
            variant="borderless"
          >
            <Suspense fallback={<div role="status">正在加载页面…</div>}>
            {view === 'home' && session && <ConsoleHome displayName={session.user.nickname || session.user.username} items={menuItems} onOpen={(target) => navigate(menuRoute(target))} />}
            <div hidden={view !== 'dramas' && view !== 'officialPublications'}>
            {view === 'dramas' && showDramas && !dramaEditor && (
              <Dashboard
                key={selectedSubjectId}
                api={api}
                canEdit={can(permissionCodes.dramaUpdate)}
                can={can}
                applicationId={selectedApplicationId}
                applicationProvider={selectedApplication?.playbackProvider}
                onOfficialPublication={session && isViewAvailable('officialPublications', session) ? drama => navigate({ view: 'officialPublications', screen: 'target', dramaId: drama.id }) : undefined}
                dramas={dramas}
                query={catalogQuery}
                total={catalogTotal}
                onQueryChange={setCatalogQuery}
                loading={loading}
                canCreate={can(permissionCodes.dramaCreate) && can(permissionCodes.mediaUpload)}
                canDelete={can(permissionCodes.dramaDelete)}
                notify={notify}
                onCreate={() => navigate({ view: 'dramas', screen: 'create' })}
                onRefresh={() => void load()}
                onSelect={(drama) => navigate({ view: 'dramas', screen: 'edit', dramaId: drama.id })}
                onDelete={async (drama) => { await deleteDrama(drama) }}
              />
            )}
            {(view === 'dramas' || Boolean(recordDramaId)) && showDramas && dramaEditor && session && (
              <div>
                <DramaEditor
                  key={selectedSubjectId}
                  api={api}
                  initial={dramaEditor.mode === 'edit' ? dramaEditor.drama : null}
                  userId={session.user.id}
                  can={can}
                  onClose={() => {
                    setDramaEditor(null)
                    navigate(menuRoute('dramas'))
                    void load()
                  }}
                  onSaved={(drama) => {
                    if (!updateDrama(drama)) return
                    if (route?.screen === 'create') navigate({ view: 'dramas', screen: 'edit', dramaId: drama.id }, { replace: true })
                  }}
                  onDelete={async (drama) => {
                    if (!await deleteDrama(drama)) return
                    navigate(menuRoute('dramas'), { replace: true })
                  }}
                  notify={notify}
                  directUploader={uploadActivity.uploader}
                />
              </div>
            )}
            </div>
            {(view === 'reviewRecords' || view === 'releaseRecords') && selectionReady && !!selectedSubjectId && session && isViewAvailable(view, session) && <PublicationRecordsPage key={`${view}:${selectedSubjectId}:${recordDramaId || ''}`} api={api} kind={view === 'reviewRecords' ? 'reviews' : 'releases'} dramaId={recordDramaId} onOpenOfficial={session && isViewAvailable('officialPublications', session) ? dramaId => navigate({ view: 'officialPublications', screen: 'target', dramaId }) : undefined} onBack={recordDramaId ? () => { navigate({ view: 'officialPublications', screen: 'target', dramaId: recordDramaId }); void load() } : undefined} />}
            {view === 'tiktokTags' && selectionReady && !!selectedSubjectId && showTikTokTags && <TikTokTagManagement key={selectedSubjectId} api={api} canUpdate={can(permissionCodes.tiktokTagUpdate)} />}
            {view === 'unlockStrategies' && showUnlockStrategies && <UnlockStrategyManagement key={selectedApplicationId} api={api} application={selectedApplication} canUpdate={can(permissionCodes.applicationUpdate)} notify={notify} onEditingStateChange={updateStrategyDraft} />}
            {view === 'reviewSettings' && selectionReady && session && isViewAvailable(view,session) && <ReviewSettingsManagement key={selectedApplicationId} applicationId={selectedApplicationId} api={api} canUpdate={can('operations.review_settings.update')} notify={notify} onEditingStateChange={updateStrategyDraft} />}
            {(view === 'officialReviewList' || view === 'directReviewList') && selectionReady && !!selectedSubjectId && session && isViewAvailable(view,session) && <ReviewWhitelistManagement key={`${view}:${selectedSubjectId}`} subjectId={selectedSubjectId} channel={view === 'directReviewList' ? 'direct' : 'official'} api={api} canUpdate={can(view === 'directReviewList' ? 'operations.direct_review_list.update' : 'operations.official_review_list.update')} notify={notify} onEditingStateChange={updateStrategyDraft} />}
            {/* 投放链接始终绑定实际选中的 Mini，服务端按该应用的播放通道核验线上内容与授权。 */}
            {view === 'officialPublications' && selectionReady && !!selectedSubjectId && session && isViewAvailable(view,session) && <OfficialPublicationManagement key={selectedSubjectId}
              api={api} applications={distributionApplications} applicationId={selectedApplicationId} canCopyCampaign={can(permissionCodes.campaignCreate)} notify={notify}
              canSync={canLegacyOr(permissionCodes.dramaSync)} canReview={canLegacyOr(permissionCodes.dramaReview)} canRelease={canLegacyOr(permissionCodes.dramaRelease)} canDistribute={canLegacyOr(permissionCodes.dramaDistribute)}
              initialDramaId={route?.screen==='target'?route.dramaId:undefined}
              onInspect={dramaId=>navigate({view:'officialPublications',screen:'target',dramaId})}
              onInspectClose={()=>navigate(menuRoute('officialPublications'),{replace:true})}
              onEdit={can(permissionCodes.dramaUpdate)&&showDramas?dramaId=>navigate({view:'dramas',screen:'edit',dramaId}):undefined}
              onOpenReviews={isViewAvailable('reviewRecords',session)?dramaId=>navigate({view:'reviewRecords',screen:'records',dramaId}):undefined}
              onOpenReleases={isViewAvailable('releaseRecords',session)?dramaId=>navigate({view:'releaseRecords',screen:'records',dramaId}):undefined}
            />}
            {view === 'directCarousel' && selectionReady && !!selectedSubjectId && session && isViewAvailable(view,session) && <CarouselManagement key={`direct-carousel:${selectedSubjectId}`} channel="direct" api={directHomepageApi} canUpdate={can('operations.direct_carousel.update')} notify={notify} />}
            {view === 'directHotDramas' && selectionReady && !!selectedSubjectId && session && isViewAvailable(view,session) && <CarouselManagement key={`direct-hot:${selectedSubjectId}`} channel="direct" kind="hot" api={directHomepageApi} canUpdate={can('operations.direct_hot.update')} notify={notify} />}
            {view === 'directCategoryRankings' && selectionReady && !!selectedSubjectId && session && isViewAvailable(view,session) && <CategoryRankingManagement key={`direct-ranking:${selectedSubjectId}`} channel="direct" api={directHomepageApi} canUpdate={can('operations.direct_ranking.update')} notify={notify} />}
            {view === 'carousel' && selectionReady && !!selectedSubjectId && showCarousel && <CarouselManagement key={selectedSubjectId} api={api} canUpdate={can(permissionCodes.carouselUpdate)} notify={notify} />}
            {view === 'categoryRankings' && selectionReady && !!selectedSubjectId && showCategoryRankings && <CategoryRankingManagement key={selectedSubjectId} api={api} canUpdate={can(permissionCodes.rankingUpdate)} notify={notify} />}
            {view === 'hotDramas' && selectionReady && !!selectedSubjectId && showHotDramas && <CarouselManagement key={selectedSubjectId} kind="hot" api={api} canUpdate={can(permissionCodes.hotUpdate)} notify={notify} />}
            {view === 'campaignReport' && selectionReady && !!selectedSubjectId && session && isViewAvailable('campaignReport', session) && <CampaignReportPage key={selectedSubjectId} api={api} applications={subjectApplications} />}
            {view === 'dramaReport' && selectionReady && !!selectedSubjectId && session && isViewAvailable('dramaReport', session) && <DramaReportPage key={selectedSubjectId} api={api} applications={subjectApplications} />}
            {view === 'adAnalytics' && showAdAnalytics && <AdAnalyticsPage key={selectedApplicationId} api={api} applicationId={selectedApplicationId} applicationName={selectedApplication?.name} notify={notify} />}
            {view === 'dashboard' && showDashboard && <AnalyticsDashboard api={api} applicationId={selectedApplicationId} onOpenPostbackLogs={showPostbackLogs ? () => navigate(menuRoute('postbackLogs')) : undefined} />}
            {view === 'postbackLogs' && showPostbackLogs && <TikTokPostbackLogList key={selectedApplicationId} api={api} applicationId={selectedApplicationId} applicationName={selectedApplication?.name} notify={notify} />}
            {view === 'consumerUsers' && showConsumerUsers && <ConsumerUserList key={selectedApplicationId} api={api} applicationId={selectedApplicationId} applicationName={selectedApplication?.name} notify={notify} />}
            {view === 'campaigns' && showCampaigns && <CampaignManagement key={selectedApplicationId} api={api} applicationName={selectedApplicationName} dramas={dramas} canCreate={can(permissionCodes.campaignCreate)} canUpdate={can(permissionCodes.campaignUpdate)} notify={notify} />}
			{view === 'subjects' && session && isViewAvailable('subjects',session) && <SubjectManagement api={api} canCreate={can(permissionCodes.subjectCreate)} canUpdate={can(permissionCodes.subjectUpdate)} onChanged={loadApplications} notify={notify} />}
			{view === 'applications' && showApplications && <ApplicationManagement key={selectedSubjectId} api={api} subjectId={selectedSubjectId} applications={subjectApplications} canCreate={!!selectedSubjectId && can(permissionCodes.applicationCreate)} canUpdate={can(permissionCodes.applicationUpdate)} canDistribute={canLegacyOr(permissionCodes.dramaDistribute) && can(permissionCodes.dramaRead)} loading={applicationsLoading} onRefresh={loadApplications} onChanged={applicationChanged} onEditingStateChange={updateStrategyDraft} notify={notify} />}
            {view === 'users' && showUsers && session && <UserManagement api={api} can={can} notify={notify} currentUserId={session.user.id} onSessionInvalidated={logout} />}
            {view === 'roles' && showRoles && <RoleManagement api={api} can={can} notify={notify} onPermissionsChanged={refreshSession} />}
            {view === 'globalConfigs' && showGlobalConfigs && <GlobalConfigManagement api={api} canUpdate={can(permissionCodes.configUpdate)} />}
            {view === 'permissions' && showPermissions && <PermissionManagement api={api} can={can} onChanged={refreshSession} />}
            {view === 'audit' && showAudit && <AuditLog api={api} notify={notify} />}
            </Suspense>
          </Card>
        </Layout.Content>
      </Layout>
      <Modal title={view === 'applications' ? '放弃应用配置的修改？' : '放弃解锁策略的修改？'} open={pendingStrategyLeave !== null} okText="放弃修改并离开" cancelText="继续编辑" okButtonProps={{ danger: true }} onCancel={() => setPendingStrategyLeave(null)} onOk={() => { const leave = pendingStrategyLeave; setPendingStrategyLeave(null); leave?.() }}>
        {view === 'applications' ? '尚未保存的应用及广告位配置将丢失。' : '尚未保存的解锁策略配置将丢失。'}
      </Modal>
    </Layout>
    </ConfigProvider>
  )
}


function errorMessage(error: unknown): string { return toUserMessage(error) }
