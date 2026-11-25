import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { consoleRoutePath, parseConsoleRoute, type ConsoleRoute } from './routes'

type NavigationOptions = { replace?: boolean }
type RouterOptions = {
  blocked: boolean
  saving: boolean
  onBlocked(continueNavigation: () => void): void
  onSavingBlocked(): void
}

// useConsoleRouter 以浏览器地址为后台页面事实，并在前进后退时保留配置草稿保护。
export function useConsoleRouter({ blocked, saving, onBlocked, onSavingBlocked }: RouterOptions) {
  // 官方发布列表用查询参数恢复详情抽屉；前进后退须同时保留路径和选择。
  const [pathname, setPathname] = useState(() => window.location.pathname + window.location.search)
  const historyIndex = useRef(Number.isInteger(window.history.state?.dramaRouteIndex) ? Number(window.history.state.dramaRouteIndex) : 0)
  const restoringPop = useRef(false)
  const acceptingPop = useRef(false)
  const route = useMemo(() => parseConsoleRoute(pathname), [pathname])

  const navigate = useCallback((target: ConsoleRoute, options?: NavigationOptions) => {
    const nextPath = consoleRoutePath(target)
    const replace = options?.replace === true
    const nextIndex = replace ? historyIndex.current : historyIndex.current + 1
    const state = { ...(window.history.state ?? {}), dramaRouteIndex: nextIndex }
    window.history[replace ? 'replaceState' : 'pushState'](state, '', nextPath)
    historyIndex.current = nextIndex
    setPathname(nextPath)
  }, [])

  // 当前记录也需要顺序标识，直接打开后台后产生的第一段前进后退才能被可靠识别。
  useEffect(() => {
    if (!Number.isInteger(window.history.state?.dramaRouteIndex)) {
      window.history.replaceState({ ...(window.history.state ?? {}), dramaRouteIndex: historyIndex.current }, '', window.location.href)
    }
  }, [])

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const targetIndex = Number.isInteger(event.state?.dramaRouteIndex) ? Number(event.state.dramaRouteIndex) : null
      if (restoringPop.current) {
        restoringPop.current = false
        setPathname(window.location.pathname + window.location.search)
        return
      }
      if (acceptingPop.current) {
        acceptingPop.current = false
        if (targetIndex !== null) historyIndex.current = targetIndex
        setPathname(window.location.pathname + window.location.search)
        return
      }
      if (saving) {
        onSavingBlocked()
        if (targetIndex !== null) {
          restoringPop.current = true
          window.history.go(historyIndex.current - targetIndex)
        }
        return
      }
      if (blocked && targetIndex !== null) {
        const delta = targetIndex - historyIndex.current
        restoringPop.current = true
        window.history.go(-delta)
        onBlocked(() => {
          acceptingPop.current = true
          window.history.go(delta)
        })
        return
      }
      if (targetIndex !== null) historyIndex.current = targetIndex
      setPathname(window.location.pathname + window.location.search)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [blocked, onBlocked, onSavingBlocked, saving])

  useEffect(() => {
    if (!blocked) return
    const preventUnsavedUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', preventUnsavedUnload)
    return () => window.removeEventListener('beforeunload', preventUnsavedUnload)
  }, [blocked])

  return { route, pathname, navigate }
}
