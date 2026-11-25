import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, type OperationsApi } from '../../api'
import { toUserMessage } from '../../userMessage'
import type { Notify } from '../../shared/notify'

// useAdminSession 独立负责登录与会话恢复，不请求短剧、应用或其他页面数据。
export function useAdminSession(api: OperationsApi, notify: Notify) {
  const [authenticated, setAuthenticated] = useState(api.hasSession())
  const [session, setSession] = useState(api.getSession())
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState('')
  const sessionRequestVersion = useRef(0)

  const endSession = useCallback(() => {
    sessionRequestVersion.current += 1
    void api.logout()
    setSession(null)
    setAuthenticated(false)
  }, [api])

  useEffect(() => api.onSessionExpired?.(() => {
    sessionRequestVersion.current += 1
    setSession(null)
    setAuthenticated(false)
    setLoginError('登录已失效，请重新登录')
  }), [api])

  useEffect(() => {
    if (!authenticated || !api.maintainSession) return
    // 定时检查及重新聚焦时续期，浏览器休眠后也能及时发现失效。
    const maintain = () => { void api.maintainSession?.().catch((error) => {
      if (!(error instanceof ApiError && error.status === 401)) {
        console.warn('管理员自动续期失败', { code: error instanceof ApiError ? error.code : 'request_failed' })
      }
    }) }
    const timer = window.setInterval(maintain, 60_000)
    window.addEventListener('focus', maintain)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', maintain) }
  }, [api, authenticated])

  // refreshSession 让权限维护后的菜单即时更新，旧请求不能覆盖较新的会话。
  const refreshSession = useCallback(async () => {
    const version = ++sessionRequestVersion.current
    const next = await api.me()
    if (version === sessionRequestVersion.current) setSession(next)
  }, [api])

  useEffect(() => {
    if (!authenticated) return
    let active = true
    void refreshSession().catch((error) => {
      if (!active) return
      if (error instanceof ApiError && error.status === 401) endSession()
      else notify(toUserMessage(error), 'error')
    })
    return () => { active = false; sessionRequestVersion.current += 1 }
  }, [authenticated, endSession, notify, refreshSession])

  const login = async (username: string, password: string) => {
    setLoginBusy(true)
    setLoginError('')
    try {
      setSession(await api.login(username, password))
      setAuthenticated(true)
    } catch (error) {
      setLoginError(toUserMessage(error))
    } finally {
      setLoginBusy(false)
    }
  }
  return { authenticated, session, setAuthenticated, loginBusy, loginError, login, endSession, refreshSession }
}
