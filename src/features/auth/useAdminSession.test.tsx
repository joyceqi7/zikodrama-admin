import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { HttpOperationsApi } from '../../api'
import { useAdminSession } from './useAdminSession'

test('任意接口返回 401 后退出控制台状态，定时器和订阅随卸载清理', async () => {
  const token = `h.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 7200 }))}.s`
  const session = { user: { id: '1' }, permissions: [], menus: [] }
  const values = new Map([['drama_admin_token', token], ['drama_admin_session', JSON.stringify(session)]])
  const api = new HttpOperationsApi('', async (url) => String(url).endsWith('/me')
    ? new Response(JSON.stringify({ data: session })) : new Response('', { status: 401 }), {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
  })
  const notify = vi.fn()
  const { result, unmount } = renderHook(() => useAdminSession(api, notify))
  await waitFor(() => expect(result.current.session).toEqual(session))
  await act(async () => { await api.listUsers().catch(() => undefined) })
  expect(result.current.authenticated).toBe(false)
  expect(result.current.session).toBeNull()
  expect(result.current.loginError).toBe('登录已失效，请重新登录')
  expect(values.has('drama_admin_token')).toBe(false)
  unmount()
})
